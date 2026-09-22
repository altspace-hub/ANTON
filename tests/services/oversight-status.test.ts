/**
 * oversight-status.test.ts — getOversightStatus (Wave 3) and the gated-module
 * list that server and client must agree on.
 *
 * The status matrix: required × signed × setting, plus the binding rule (a
 * sign-off on another answer of the same session does not count when a
 * messageId is asked about) and the default of the oversight_blocks_export
 * setting (OFF when no row exists, OFF on a database error).
 *
 * The agreement test reads the two client copies from source — the client
 * build cannot import server/, so the mirror in HumanOversightGate.tsx and the
 * mount condition in ModulePage.tsx are text-checked against the server list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  OVERSIGHT_GATED_MODULES,
  OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY,
  OVERSIGHT_STATUS_SQL,
  getOversightStatus,
  isOversightBlockingExport,
  isOversightGatedModule,
  setOversightBlocksExport,
  type OversightReviewRow,
} from '../../server/services/oversight-status.js';
import { OVERSIGHT_REQUIRED_MODULES } from '../../server/routes/human-oversight.js';

const SESSION = 'sess-1';

function review(overrides: Partial<OversightReviewRow>): OversightReviewRow {
  return {
    id: 1, session_id: SESSION, module_id: 'gap-analysis', user_id: 'default',
    reviewer_name: 'Ada', reviewer_role: null, attestation: 'I, Ada, …', verdict: 'approved',
    notes: null, export_blocked: 0, message_id: 'msg-1', prompt_sha256: 'p'.repeat(64),
    output_sha256: 'o'.repeat(64), evidence_pack_id: null, created_at: '2026-09-16T10:05:00Z',
    ...overrides,
  };
}

interface FakeOpts {
  reviews?: OversightReviewRow[];
  settings?: Record<string, string>;
  /** Every app_settings read throws. */
  settingsThrow?: boolean;
}

function makeFakeDb(opts: FakeOpts = {}): { db: DatabaseAdapter; settings: Map<string, string>; settingReads: number } {
  const settings = new Map(Object.entries(opts.settings ?? {}));
  const reviews = [...(opts.reviews ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const counters = { settingReads: 0 };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM app_settings')) {
        counters.settingReads++;
        if (opts.settingsThrow) throw new Error('relation "app_settings" does not exist');
        const value = settings.get(String(params[0]));
        return value === undefined ? undefined : ({ value } as T);
      }
      if (sql === OVERSIGHT_STATUS_SQL.sessionMessageReview) {
        return reviews.find((r) => r.session_id === params[0] && r.message_id === params[1]) as T | undefined;
      }
      if (sql === OVERSIGHT_STATUS_SQL.sessionLatestReview) {
        return reviews.find((r) => r.session_id === params[0]) as T | undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.startsWith('INSERT INTO app_settings')) settings.set(String(params[0]), String(params[1]));
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, settings, get settingReads() { return counters.settingReads; } };
}

describe('the gated-module list', () => {
  it('is exactly the three EU AI Act Art. 14 modules', () => {
    expect([...OVERSIGHT_GATED_MODULES]).toEqual(['gap-analysis', 'sanctions-advisory', 'investigation-support']);
    expect(isOversightGatedModule('gap-analysis')).toBe(true);
    expect(isOversightGatedModule('sanctions-advisory')).toBe(true);
    expect(isOversightGatedModule('investigation-support')).toBe(true);
    expect(isOversightGatedModule('policy-drafting')).toBe(false);
    expect(isOversightGatedModule(null)).toBe(false);
    expect(isOversightGatedModule('')).toBe(false);
  });

  it('the route re-exports the same array (existing importers keep working)', () => {
    expect(OVERSIGHT_REQUIRED_MODULES).toBe(OVERSIGHT_GATED_MODULES);
  });

  it('the client mirror in HumanOversightGate.tsx agrees with the server list', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shared/HumanOversightGate.tsx'), 'utf8');
    const m = src.match(/export const OVERSIGHT_GATED_MODULES = \[([\s\S]*?)\] as const;/);
    expect(m, 'HumanOversightGate.tsx must export OVERSIGHT_GATED_MODULES as a literal array').toBeTruthy();
    const ids = [...(m as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(ids).toEqual([...OVERSIGHT_GATED_MODULES]);
  });

  it('the mount condition in ModulePage.tsx agrees with the server list', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/ModulePage.tsx'), 'utf8');
    // Either the inline literal that gates <HumanOversightGate>, or an import of the mirror.
    // Accept both `import { X }` and `import Default, { X }` forms.
    const importsMirror = /import\s*(?:\w+\s*,\s*)?\{[^}]*\bOVERSIGHT_GATED_MODULES\b[^}]*\}\s*from\s*'@\/components\/shared\/HumanOversightGate'/.test(src);
    const inline = src.match(/\[((?:\s*'[a-z-]+'\s*,?)+)\]\.includes\(moduleId \?\? ''\)\s*&&\s*\(\s*<HumanOversightGate/);
    if (importsMirror && !inline) return;
    expect(inline, 'ModulePage.tsx must gate <HumanOversightGate> on the module list').toBeTruthy();
    const ids = [...(inline as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(ids).toEqual([...OVERSIGHT_GATED_MODULES]);
  });
});

describe('the oversight_blocks_export setting', () => {
  it('has the documented key and is OFF when no row exists', async () => {
    expect(OVERSIGHT_BLOCKS_EXPORT_SETTING_KEY).toBe('oversight_blocks_export');
    const { db } = makeFakeDb();
    expect(await isOversightBlockingExport(db)).toBe(false);
  });

  it.each([
    ['true', true], ['1', true], ['TRUE', true], [' true ', true],
    ['false', false], ['0', false], ['', false], ['yes', false], ['on', false],
  ])('value %j → %s', async (value, expected) => {
    const { db } = makeFakeDb({ settings: { oversight_blocks_export: value } });
    expect(await isOversightBlockingExport(db)).toBe(expected);
  });

  it('is OFF when the settings read fails (never locks exports on a broken table)', async () => {
    const { db } = makeFakeDb({ settingsThrow: true });
    expect(await isOversightBlockingExport(db)).toBe(false);
  });

  it('round-trips through setOversightBlocksExport', async () => {
    const { db, settings } = makeFakeDb();
    await setOversightBlocksExport(db, true);
    expect(settings.get('oversight_blocks_export')).toBe('true');
    expect(await isOversightBlockingExport(db)).toBe(true);
    await setOversightBlocksExport(db, false);
    expect(settings.get('oversight_blocks_export')).toBe('false');
    expect(await isOversightBlockingExport(db)).toBe(false);
  });
});

describe('getOversightStatus', () => {
  it('a module outside the list is never required and never blocks — and reads nothing', async () => {
    const fake = makeFakeDb({ reviews: [review({})], settings: { oversight_blocks_export: 'true' } });
    const status = await getOversightStatus(fake.db, SESSION, 'policy-drafting', 'msg-1');
    expect(status).toEqual({ required: false, signed: false, review: null, blocksExport: false });
    expect(fake.settingReads).toBe(0);
  });

  it('required + unsigned + setting off (default) → not blocked', async () => {
    const { db } = makeFakeDb();
    const status = await getOversightStatus(db, SESSION, 'gap-analysis', 'msg-1');
    expect(status).toEqual({ required: true, signed: false, review: null, blocksExport: false });
  });

  it('required + unsigned + setting on → blocked', async () => {
    const { db } = makeFakeDb({ settings: { oversight_blocks_export: 'true' } });
    const status = await getOversightStatus(db, SESSION, 'sanctions-advisory', 'msg-1');
    expect(status.required).toBe(true);
    expect(status.signed).toBe(false);
    expect(status.blocksExport).toBe(true);
  });

  it('required + signed (approved, bound to the message) → not blocked even with the setting on, and the setting is not read', async () => {
    const fake = makeFakeDb({ reviews: [review({})], settings: { oversight_blocks_export: 'true' } });
    const status = await getOversightStatus(fake.db, SESSION, 'investigation-support', 'msg-1');
    expect(status.required).toBe(true);
    expect(status.signed).toBe(true);
    expect(status.blocksExport).toBe(false);
    expect(status.review?.output_sha256).toBe('o'.repeat(64));
    expect(fake.settingReads).toBe(0);
  });

  it.each(['requires_amendment', 'rejected'] as const)('a %s verdict is a review but not a signature', async (verdict) => {
    const { db } = makeFakeDb({ reviews: [review({ verdict })], settings: { oversight_blocks_export: 'true' } });
    const status = await getOversightStatus(db, SESSION, 'gap-analysis', 'msg-1');
    expect(status.signed).toBe(false);
    expect(status.review?.verdict).toBe(verdict);
    expect(status.blocksExport).toBe(true);
  });

  it('a sign-off bound to an earlier answer does not cover a later one', async () => {
    const { db } = makeFakeDb({ reviews: [review({ message_id: 'msg-1' })], settings: { oversight_blocks_export: 'true' } });
    const status = await getOversightStatus(db, SESSION, 'gap-analysis', 'msg-2');
    expect(status.signed).toBe(false);
    expect(status.review).toBeNull();
    expect(status.blocksExport).toBe(true);
  });

  it('a pre-273 unbound review does not satisfy a bound lookup', async () => {
    const { db } = makeFakeDb({ reviews: [review({ message_id: null, prompt_sha256: null, output_sha256: null })] });
    const status = await getOversightStatus(db, SESSION, 'gap-analysis', 'msg-1');
    expect(status.signed).toBe(false);
    expect(status.review).toBeNull();
  });

  it('without a messageId the latest review of the session decides', async () => {
    const { db } = makeFakeDb({
      reviews: [
        review({ id: 1, message_id: 'msg-1', verdict: 'rejected', created_at: '2026-09-16T09:00:00Z' }),
        review({ id: 2, message_id: 'msg-2', verdict: 'approved', created_at: '2026-09-16T11:00:00Z' }),
      ],
      settings: { oversight_blocks_export: 'true' },
    });
    const status = await getOversightStatus(db, SESSION, 'gap-analysis');
    expect(status.signed).toBe(true);
    expect(status.review?.id).toBe(2);
    expect(status.blocksExport).toBe(false);
  });

  it('another session\'s review never counts', async () => {
    const { db } = makeFakeDb({ reviews: [review({ session_id: 'sess-other', message_id: 'msg-1' })] });
    const status = await getOversightStatus(db, SESSION, 'gap-analysis', 'msg-1');
    expect(status.signed).toBe(false);
    expect(status.review).toBeNull();
  });

  it('a null module id is not required', async () => {
    const { db } = makeFakeDb();
    const status = await getOversightStatus(db, SESSION, null);
    expect(status.required).toBe(false);
  });
});
