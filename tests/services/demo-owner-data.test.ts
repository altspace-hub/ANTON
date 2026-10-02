/**
 * demo-owner-data.test.ts — the boot check for the owner's data in a public
 * demo's database (services/demo-owner-data.ts; privacy memo G6, privacy
 * verification 2026-09-26 problem 13).
 *
 * The org context, the Trades business identity and the fund identity reach a
 * visitor's run and the prompt preview; shared knowledge atoms are the
 * instance's memory. The check names what it finds and never its content, and
 * a check that cannot run is reported, not taken for a clean database.
 *
 * Negative controls: an empty database (including the empty org-context row
 * that reading the page creates) gives no warning. The SQL is run against the
 * real schema in demo-owner-data.db.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { findDemoOwnerData, demoOwnerDataWarning } from '../../server/services/demo-owner-data.js';

interface FakeTables {
  org_context?: Array<Record<string, unknown>>;
  business_identity?: Array<Record<string, unknown>>;
  fund_identity?: Array<Record<string, unknown>>;
  sharedAtoms?: number;
  /** Tables whose query throws, as a missing table would. */
  broken?: string[];
}

const SECRET = 'Acme Secret Holdings AB';

/** A database adapter that answers the check's four queries from plain arrays. */
function fakeDb(t: FakeTables): DatabaseAdapter {
  const table = (sql: string): string => {
    const m = /FROM (\w+)/.exec(sql);
    const name = m?.[1] ?? '';
    if (t.broken?.includes(name)) throw new Error(`relation "${name}" does not exist`);
    return name;
  };
  return {
    all: async (sql: string) => {
      const name = table(sql);
      return name === 'org_context' ? (t.org_context ?? []) : [];
    },
    get: async (sql: string) => {
      const name = table(sql);
      if (name === 'knowledge_atoms') return { n: String(t.sharedAtoms ?? 0) };
      if (name === 'business_identity') return t.business_identity?.length ? { present: 1 } : undefined;
      if (name === 'fund_identity') return t.fund_identity?.length ? { present: 1 } : undefined;
      return undefined;
    },
    run: async () => ({ changes: 0 }),
  } as unknown as DatabaseAdapter;
}

/** The empty row GET /org-context creates (services/org-context.ts), as PostgreSQL returns it. */
const EMPTY_ORG_ROW = {
  org_name: null, org_type: null, jurisdiction: null, risk_appetite: null, custom_context: null,
  regulatory_perimeter: '[]', current_priorities: '[]', key_systems: '[]', key_relationships: '[]', regulatory_calendar: '[]',
};

describe('findDemoOwnerData', () => {
  it('finds nothing in a fresh database, even with the empty org-context row (negative control)', async () => {
    for (const db of [fakeDb({}), fakeDb({ org_context: [EMPTY_ORG_ROW] })]) {
      const report = await findDemoOwnerData(db);
      expect(report).toEqual({ found: [], unchecked: [] });
      expect(demoOwnerDataWarning(report)).toBeNull();
    }
  });

  it('finds a filled-in org context, by any field a person fills in', async () => {
    for (const field of [{ org_name: SECRET }, { custom_context: SECRET }, { jurisdiction: 'SE' }, { current_priorities: JSON.stringify([SECRET]) }, { regulatory_perimeter: '["AMLR"]' }]) {
      const report = await findDemoOwnerData(fakeDb({ org_context: [{ ...EMPTY_ORG_ROW, ...field }] }));
      expect(report.found, JSON.stringify(field)).toEqual(['the org context']);
    }
    // Whitespace is not content.
    expect((await findDemoOwnerData(fakeDb({ org_context: [{ ...EMPTY_ORG_ROW, org_name: '   ' }] }))).found).toEqual([]);
  });

  it('finds the Trades identity, the fund identity and shared atoms, and names each', async () => {
    const report = await findDemoOwnerData(fakeDb({
      org_context: [{ ...EMPTY_ORG_ROW, org_name: SECRET }],
      business_identity: [{ id: 'default', profile_data: JSON.stringify({ businessName: SECRET }) }],
      fund_identity: [{ id: 'default', fund_name: SECRET }],
      sharedAtoms: 3,
    }));
    expect(report.found).toEqual(['the org context', 'the Trades business identity', 'the fund identity', '3 shared knowledge atoms']);
    expect(report.unchecked).toEqual([]);
  });

  it('reports a check that cannot run instead of calling the database clean', async () => {
    const report = await findDemoOwnerData(fakeDb({ fund_identity: [{ id: 'default' }], broken: ['org_context', 'knowledge_atoms'] }));
    expect(report.found).toEqual(['the fund identity']);
    expect(report.unchecked).toEqual(['the org context', 'shared knowledge atoms']);
  });
});

describe('demoOwnerDataWarning', () => {
  it('is one line naming what was found and what was not checked, never the content', async () => {
    const report = await findDemoOwnerData(fakeDb({
      org_context: [{ ...EMPTY_ORG_ROW, org_name: SECRET, custom_context: SECRET }],
      fund_identity: [{ id: 'default', fund_name: SECRET }],
      sharedAtoms: 1,
      broken: ['business_identity'],
    }));
    const line = demoOwnerDataWarning(report);
    expect(line).not.toBeNull();
    expect(line).not.toContain('\n');
    expect(line).toContain('the org context');
    expect(line).toContain('the fund identity');
    expect(line).toContain('1 shared knowledge atom');
    expect(line).not.toContain('1 shared knowledge atoms');
    expect(line).toContain('Could not check the Trades business identity');
    expect(line).toContain('freshly initialised database');
    expect(line).not.toContain(SECRET);
  });
});

describe('index.ts', () => {
  it('runs the check in demo mode once the database is ready, and logs its line', () => {
    const src = readFileSync(join(__dirname, '../../server/index.ts'), 'utf8');
    const dbReady = src.indexOf('await initDatabaseAdapter()');
    const check = src.indexOf('findDemoOwnerData(db)');
    expect(dbReady).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(dbReady);
    const block = src.slice(src.lastIndexOf('if (isDemoMode())', check), check + 200);
    expect(block).toContain('if (isDemoMode())');
    expect(block).toContain('logger.warn(`[demo] ${warning}`)');
  });
});
