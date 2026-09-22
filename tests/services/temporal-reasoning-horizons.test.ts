/**
 * temporal-reasoning-horizons.test.ts — goals-profile horizons are scoped by
 * domain (Wave 4, track C).
 *
 * goals_profiles is keyed by user only and is written from the Markets Goals
 * page. Before applies_to, one edit there put Markets horizons into every
 * Work run's "Active Time Horizons". The horizons now follow the same
 * MARKET_DOMAINS gate as the learned market atoms unless the owner widened
 * the profile to 'all'. Values and strategy are untouched by the gate.
 * No database: a fake adapter answers the five reads of getDecisionContext.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  createTemporalReasoningService,
  MARKET_DOMAINS,
  GOALS_APPLIES_TO,
  isGoalsAppliesTo,
} from '../../server/services/temporal-reasoning.js';

interface FakeOpts {
  /** The goals_profiles row as PostgreSQL returns it (JSON columns as text). */
  profile?: Record<string, unknown> | null;
  strategy?: Record<string, unknown> | null;
  values?: Array<Record<string, unknown>>;
  patterns?: Array<{ content: string; confidence: number; horizon: string | null }>;
}

function makeFakeDb(opts: FakeOpts) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const valuesScopes: unknown[] = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.startsWith('SELECT id FROM goals_profiles')) {
        return (opts.profile ? { id: opts.profile.id } : undefined) as T | undefined;
      }
      if (sql.includes('FROM goals_profiles')) return (opts.profile ?? undefined) as T | undefined;
      if (sql.includes('FROM domain_strategies')) {
        expect(params[0]).toBe('default');
        return (opts.strategy ?? undefined) as T | undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM values_constraints')) { valuesScopes.push(params[1]); return (opts.values ?? []) as T[]; }
      if (sql.includes('FROM conflict_resolution_rules')) return [] as T[];
      if (sql.includes('FROM market_atoms')) return (opts.patterns ?? []) as T[];
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      runs.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, runs, valuesScopes };
}

function profileRow(applies_to: string | null | undefined) {
  return {
    id: 'gp-1', user_id: 'default',
    today_focus: JSON.stringify(['Rebalance into tech']),
    this_week_goals: JSON.stringify(['Trim the energy position']),
    this_month_goals: '[]', this_year_goals: '[]',
    this_decade_vision: 'Financial independence',
    ...(applies_to === undefined ? {} : { applies_to }),
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  };
}

const STRATEGY = { id: 'ds-1', user_id: 'default', domain: 'fcp', strategy_type: 'balanced', strategy_label: 'Balanced', parameters: '{}', atom_weights: '{"signal":1}', is_active: 1 };
const VALUES = [{ id: 'vc-1', user_id: 'default', name: 'No tobacco', description: null, constraint_type: 'exclude_sector', scope: 'all', value: 'tobacco', enforcement: 'hard', is_active: 1 }];
const PATTERNS = [{ content: 'Overconfidence at this_month horizon', confidence: 0.6, horizon: 'this_month' }];

describe('the domain gate', () => {
  it('MARKET_DOMAINS is exported and names exactly finance and markets', () => {
    expect([...MARKET_DOMAINS].sort()).toEqual(['finance', 'markets']);
  });

  it('applies_to vocabulary', () => {
    expect([...GOALS_APPLIES_TO]).toEqual(['markets', 'all']);
    expect(isGoalsAppliesTo('markets')).toBe(true);
    expect(isGoalsAppliesTo('all')).toBe(true);
    expect(isGoalsAppliesTo('everything')).toBe(false);
    expect(isGoalsAppliesTo(undefined)).toBe(false);
    expect(isGoalsAppliesTo(1)).toBe(false);
  });
});

describe('getDecisionContext — horizons scoped by domain', () => {
  it("applies_to = 'markets': a Work domain ('fcp') gets NO horizons and NO market patterns, but keeps values and strategy", async () => {
    const { db, valuesScopes } = makeFakeDb({ profile: profileRow('markets'), strategy: STRATEGY, values: VALUES, patterns: PATTERNS });
    const svc = await createTemporalReasoningService(db);
    const ctx = await svc.getDecisionContext('default', 'fcp');
    expect(ctx.horizons).toBeNull();
    expect(ctx.temporalPatterns).toEqual([]);
    expect(ctx.strategy?.strategy_type).toBe('balanced');
    expect(ctx.strategy?.atom_weights).toEqual({ signal: 1 });
    expect(ctx.values).toEqual(VALUES);
    expect(valuesScopes).toEqual(['fcp']);
  });

  it("applies_to = 'markets': 'finance' gets the horizons and the market patterns", async () => {
    const { db } = makeFakeDb({ profile: profileRow('markets'), strategy: STRATEGY, values: VALUES, patterns: PATTERNS });
    const svc = await createTemporalReasoningService(db);
    const ctx = await svc.getDecisionContext('default', 'finance');
    expect(ctx.horizons?.today_focus).toEqual(['Rebalance into tech']);
    expect(ctx.horizons?.applies_to).toBe('markets');
    expect(ctx.temporalPatterns).toEqual(PATTERNS);
  });

  it("'markets' domain behaves like 'finance'", async () => {
    const { db } = makeFakeDb({ profile: profileRow('markets'), patterns: PATTERNS });
    const svc = await createTemporalReasoningService(db);
    const ctx = await svc.getDecisionContext('default', 'markets');
    expect(ctx.horizons).not.toBeNull();
    expect(ctx.temporalPatterns).toEqual(PATTERNS);
  });

  it("applies_to = 'all': 'fcp' gets the horizons — but still no market patterns (those stay Markets learning)", async () => {
    const { db } = makeFakeDb({ profile: profileRow('all'), patterns: PATTERNS });
    const svc = await createTemporalReasoningService(db);
    const ctx = await svc.getDecisionContext('default', 'fcp');
    expect(ctx.horizons?.this_week_goals).toEqual(['Trim the energy position']);
    expect(ctx.horizons?.applies_to).toBe('all');
    expect(ctx.temporalPatterns).toEqual([]);
  });

  it('no profile at all → horizons null in every domain', async () => {
    const { db } = makeFakeDb({ profile: null });
    const svc = await createTemporalReasoningService(db);
    expect((await svc.getDecisionContext('default', 'finance')).horizons).toBeNull();
    expect((await svc.getDecisionContext('default', 'fcp')).horizons).toBeNull();
  });
});

describe('getGoalsProfile — applies_to normalisation', () => {
  it.each([
    ['all', 'all'],
    ['markets', 'markets'],
    ['everything', 'markets'],
    [null, 'markets'],
    [undefined, 'markets'],
  ] as Array<[string | null | undefined, string]>)('stored %j → %s', async (stored, expected) => {
    const { db } = makeFakeDb({ profile: profileRow(stored) });
    const svc = await createTemporalReasoningService(db);
    const profile = await svc.getGoalsProfile('default');
    expect(profile?.applies_to).toBe(expected);
    expect(profile?.today_focus).toEqual(['Rebalance into tech']);
  });
});

describe('upsertGoalsProfile — applies_to', () => {
  it('updates applies_to on an existing profile', async () => {
    const { db, runs } = makeFakeDb({ profile: profileRow('markets') });
    const svc = await createTemporalReasoningService(db);
    await svc.upsertGoalsProfile('default', { applies_to: 'all' });
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toMatch(/^UPDATE goals_profiles SET applies_to = \?, updated_at = NOW\(\) WHERE user_id = \?$/);
    expect(runs[0].params).toEqual(['all', 'default']);
  });

  it('writes applies_to on insert, defaulting to markets', async () => {
    const { db, runs } = makeFakeDb({ profile: null });
    const svc = await createTemporalReasoningService(db);
    await svc.upsertGoalsProfile('default', { today_focus: ['x'] });
    expect(runs[0].sql).toMatch(/INSERT INTO goals_profiles/);
    expect(runs[0].sql).toMatch(/applies_to/);
    expect(runs[0].params[runs[0].params.length - 1]).toBe('markets');

    await svc.upsertGoalsProfile('default', { applies_to: 'all' });
    expect(runs[1].params[runs[1].params.length - 1]).toBe('all');
  });

  it('rejects an unknown applies_to without touching the database', async () => {
    const { db, runs } = makeFakeDb({ profile: profileRow('markets') });
    const svc = await createTemporalReasoningService(db);
    await expect(svc.upsertGoalsProfile('default', { applies_to: 'everyone' as unknown as 'all' })).rejects.toThrow(/applies_to/);
    expect(runs).toHaveLength(0);
  });

  it('leaves applies_to alone when the body does not mention it', async () => {
    const { db, runs } = makeFakeDb({ profile: profileRow('all') });
    const svc = await createTemporalReasoningService(db);
    await svc.upsertGoalsProfile('default', { this_decade_vision: 'Retire early' });
    expect(runs[0].sql).not.toMatch(/applies_to/);
  });
});

describe('buildGoalsValuesLayer — what a Work run actually sees', () => {
  it("applies_to = 'markets': the FCP layer carries values but no 'Active Time Horizons'", async () => {
    const { db } = makeFakeDb({ profile: profileRow('markets'), values: VALUES });
    const svc = await createTemporalReasoningService(db);
    const layer = await svc.buildGoalsValuesLayer('default', 'fcp');
    expect(layer).not.toContain('Active Time Horizons');
    expect(layer).not.toContain('Rebalance into tech');
    expect(layer).toContain('Values Constraints');
    expect(layer).toContain('No tobacco');
  });

  it("applies_to = 'all': the FCP layer carries the horizons", async () => {
    const { db } = makeFakeDb({ profile: profileRow('all') });
    const svc = await createTemporalReasoningService(db);
    const layer = await svc.buildGoalsValuesLayer('default', 'fcp');
    expect(layer).toContain('Active Time Horizons');
    expect(layer).toContain('Rebalance into tech');
  });

  it("applies_to = 'markets': a Work run with nothing else configured gets an empty layer", async () => {
    const { db } = makeFakeDb({ profile: profileRow('markets') });
    const svc = await createTemporalReasoningService(db);
    expect(await svc.buildGoalsValuesLayer('default', 'legal')).toBe('');
    expect(await svc.buildGoalsValuesLayer('default', 'finance')).toContain('Active Time Horizons');
  });
});
