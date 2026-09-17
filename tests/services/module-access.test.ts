/**
 * module-access.test.ts — the per-role module verdict (Wave 6 track F).
 *
 * Against a fake adapter that answers the service's own statements by
 * identity and keeps module_access_rules in an array (no database):
 *
 *   - solo mode and admin bypass the rules without a read;
 *   - the precedence matrix: module beats area beats wildcard;
 *   - within one scope deny beats allow;
 *   - no rule → allowed (default open);
 *   - the 60 s cache, and that every write and resetModuleAccessCache drop it;
 *   - a database error → allowed with reason 'access rules unavailable' and
 *     one console.warn — never a lock-out;
 *   - effectiveAccessForRole for the Settings preview.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  MODULE_ACCESS_SQL,
  addModuleAccessRule,
  decideFromRules,
  effectiveAccessForRole,
  isModuleAllowed,
  listModuleAccessRules,
  removeModuleAccessRule,
  resetModuleAccessCache,
  ruleScope,
  type ModuleAccessRule,
} from '../../server/services/module-access.js';

interface Row {
  id: string; role: string; module_id: string | null; area_id: string | null;
  effect: string; note: string | null; created_by: string | null; created_at: string | Date;
}

const state = { rows: [] as Row[], reads: 0, allThrows: false, runThrows: false };

let seq = 0;
function row(role: string, effect: 'allow' | 'deny', moduleId: string | null = null, areaId: string | null = null): Row {
  seq += 1;
  return { id: `r${seq}`, role, module_id: moduleId, area_id: areaId, effect, note: null, created_by: null, created_at: `2026-09-17T00:00:${String(seq).padStart(2, '0')}Z` };
}

const db = {
  dialect: 'postgresql',
  async get<T>(): Promise<T | undefined> { return undefined; },
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    state.reads += 1;
    if (state.allThrows) throw new Error('connection terminated unexpectedly');
    if (sql === MODULE_ACCESS_SQL.byRole) return state.rows.filter((r) => r.role === params[0]) as T[];
    if (sql === MODULE_ACCESS_SQL.all) return [...state.rows] as T[];
    throw new Error(`unexpected statement: ${sql}`);
  },
  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    if (state.runThrows) throw new Error('connection terminated unexpectedly');
    if (sql === MODULE_ACCESS_SQL.insert) {
      const [id, role, module_id, area_id, effect, note, created_by] = params as [string, string, string | null, string | null, string, string | null, string | null];
      state.rows.push({ id, role, module_id, area_id, effect, note, created_by, created_at: new Date() });
      return { changes: 1, lastInsertRowid: 0 };
    }
    if (sql === MODULE_ACCESS_SQL.remove) {
      const before = state.rows.length;
      state.rows = state.rows.filter((r) => r.id !== params[0]);
      return { changes: before - state.rows.length, lastInsertRowid: 0 };
    }
    throw new Error(`unexpected statement: ${sql}`);
  },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

beforeEach(() => {
  state.rows = [];
  state.reads = 0;
  state.allThrows = false;
  state.runThrows = false;
  resetModuleAccessCache();
});

afterEach(() => { vi.restoreAllMocks(); });

const team = (role: string | null | undefined, moduleId: string | null, areaId: string | null) =>
  isModuleAllowed(db, { role, moduleId, areaId, teamMode: true });

describe('bypasses', () => {
  it('solo mode is allowed without reading a rule, whatever the role', async () => {
    state.rows.push(row('viewer', 'deny'));
    const v = await isModuleAllowed(db, { role: 'viewer', moduleId: 'gap-analysis', areaId: 'fcp', teamMode: false });
    expect(v).toEqual({ allowed: true, rule: null, reason: 'solo mode' });
    expect(state.reads).toBe(0);
  });

  it('an admin is allowed without reading a rule', async () => {
    state.rows.push(row('admin', 'deny'));
    const v = await team('admin', 'gap-analysis', 'fcp');
    expect(v).toEqual({ allowed: true, rule: null, reason: 'admin' });
    expect(state.reads).toBe(0);
  });
});

describe('default open', () => {
  it('no rule for the role → allowed with a null rule', async () => {
    state.rows.push(row('analyst', 'deny'));           // another role's rule is not this role's
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v).toEqual({ allowed: true, rule: null, reason: 'no rule — default open' });
  });

  it('a missing role is evaluated as viewer, the least privileged', async () => {
    state.rows.push(row('viewer', 'deny'));
    expect((await team(null, 'gap-analysis', 'fcp')).allowed).toBe(false);
    expect((await team(undefined, 'gap-analysis', 'fcp')).allowed).toBe(false);
    expect((await team('   ', 'gap-analysis', 'fcp')).allowed).toBe(false);
  });
});

describe('precedence: module beats area beats wildcard', () => {
  it.each([
    ['wildcard deny, area allow → allowed by area', [row('viewer', 'deny'), row('viewer', 'allow', null, 'fcp')], true, 'area'],
    ['wildcard allow, area deny → denied by area', [row('viewer', 'allow'), row('viewer', 'deny', null, 'fcp')], false, 'area'],
    ['area deny, module allow → allowed by module', [row('viewer', 'deny', null, 'fcp'), row('viewer', 'allow', 'gap-analysis')], true, 'module'],
    ['area allow, module deny → denied by module', [row('viewer', 'allow', null, 'fcp'), row('viewer', 'deny', 'gap-analysis')], false, 'module'],
    ['wildcard deny alone → denied by all', [row('viewer', 'deny')], false, 'all'],
    ['wildcard deny, area deny, module allow → allowed by module', [row('viewer', 'deny'), row('viewer', 'deny', null, 'fcp'), row('viewer', 'allow', 'gap-analysis')], true, 'module'],
  ] as Array<[string, Row[], boolean, string]>)('%s', async (_name, rows, allowed, scope) => {
    state.rows.push(...rows);
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.allowed).toBe(allowed);
    expect(v.rule?.scope).toBe(scope);
    expect(v.reason).toBe(`${allowed ? 'allowed' : 'denied'} by ${scope} rule`);
  });

  it('a module rule for another module does not match — the area rule decides', async () => {
    state.rows.push(row('viewer', 'allow', 'document-creation'), row('viewer', 'deny', null, 'fcp'));
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.allowed).toBe(false);
    expect(v.rule?.scope).toBe('area');
  });

  it('an area rule for another area does not match — the wildcard decides', async () => {
    state.rows.push(row('viewer', 'allow', null, 'legal'), row('viewer', 'deny'));
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.allowed).toBe(false);
    expect(v.rule?.scope).toBe('all');
  });

  it('no module (open chat): only the wildcard can match', async () => {
    state.rows.push(row('viewer', 'deny', 'gap-analysis'), row('viewer', 'deny', null, 'fcp'));
    expect((await team('viewer', null, null)).allowed).toBe(true);
    state.rows.push(row('viewer', 'deny'));
    resetModuleAccessCache();
    expect((await team('viewer', null, null)).rule?.scope).toBe('all');
  });

  it('no area given: area rules are skipped, module and wildcard still apply', async () => {
    state.rows.push(row('viewer', 'deny', null, 'fcp'));
    expect((await team('viewer', 'gap-analysis', null)).allowed).toBe(true);
    state.rows.push(row('viewer', 'deny', 'gap-analysis'));
    resetModuleAccessCache();
    expect((await team('viewer', 'gap-analysis', null)).rule?.scope).toBe('module');
  });

  it('the rule that decided is named by id', async () => {
    const deny = row('viewer', 'deny', 'gap-analysis');
    state.rows.push(row('viewer', 'allow'), deny);
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.rule).toEqual({ id: deny.id, effect: 'deny', scope: 'module' });
  });
});

describe('within one scope, deny beats allow', () => {
  it.each([
    ['module', 'gap-analysis', null],
    ['area', null, 'fcp'],
    ['all', null, null],
  ] as Array<[string, string | null, string | null]>)('%s scope: allow then deny → denied; deny then allow → denied', async (scope, moduleId, areaId) => {
    state.rows.push(row('viewer', 'allow', moduleId, areaId), row('viewer', 'deny', moduleId, areaId));
    let v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.allowed).toBe(false);
    expect(v.rule?.scope).toBe(scope);

    state.rows = [row('viewer', 'deny', moduleId, areaId), row('viewer', 'allow', moduleId, areaId)];
    resetModuleAccessCache();
    v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v.allowed).toBe(false);
  });
});

describe('cache', () => {
  it('reads once per role within the window; a rule added behind its back is invisible until reset', async () => {
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(true);
    expect(state.reads).toBe(1);
    state.rows.push(row('viewer', 'deny'));
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(true);   // cached
    expect(state.reads).toBe(1);
    resetModuleAccessCache();
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(false);
    expect(state.reads).toBe(2);
  });

  it('roles are cached apart', async () => {
    state.rows.push(row('viewer', 'deny'));
    expect((await team('viewer', 'x', null)).allowed).toBe(false);
    expect((await team('analyst', 'x', null)).allowed).toBe(true);
    expect(state.reads).toBe(2);
  });

  it('addModuleAccessRule and removeModuleAccessRule drop the cache', async () => {
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(true);
    const added = await addModuleAccessRule(db, { role: 'viewer', areaId: 'fcp', effect: 'deny' });
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(false);
    expect(await removeModuleAccessRule(db, added.id)).toBe(true);
    expect((await team('viewer', 'gap-analysis', 'fcp')).allowed).toBe(true);
    expect(await removeModuleAccessRule(db, 'no-such-id')).toBe(false);
  });

  it('a failed read is not cached — the next read tries the database again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.allThrows = true;
    state.rows.push(row('viewer', 'deny'));
    expect((await team('viewer', 'x', null)).reason).toBe('access rules unavailable');
    state.allThrows = false;
    expect((await team('viewer', 'x', null)).allowed).toBe(false);
    expect(state.reads).toBe(2);
  });
});

describe('a broken read never locks anyone out', () => {
  it('→ allowed, reason "access rules unavailable", exactly one console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.allThrows = true;
    const v = await team('viewer', 'gap-analysis', 'fcp');
    expect(v).toEqual({ allowed: true, rule: null, reason: 'access rules unavailable' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[module-access]');
  });
});

describe('effectiveAccessForRole (Settings preview)', () => {
  const catalogue = [
    { id: 'gap-analysis', areaId: 'fcp' },
    { id: 'sanctions-advisory', areaId: 'fcp' },
    { id: 'contract-review', areaId: 'legal' },
    { id: 'custom-1', areaId: null },
  ];

  it('answers one verdict per module from the role\'s rules', async () => {
    state.rows.push(row('viewer', 'deny', null, 'fcp'), row('viewer', 'allow', 'gap-analysis'));
    const map = await effectiveAccessForRole(db, 'viewer', catalogue);
    expect([...map.entries()]).toEqual([
      ['gap-analysis', true], ['sanctions-advisory', false], ['contract-review', true], ['custom-1', true],
    ]);
  });

  it('admin runs everything; a wildcard deny stops everything else', async () => {
    state.rows.push(row('analyst', 'deny'));
    expect([...(await effectiveAccessForRole(db, 'admin', catalogue)).values()]).toEqual([true, true, true, true]);
    expect([...(await effectiveAccessForRole(db, 'analyst', catalogue)).values()]).toEqual([false, false, false, false]);
  });

  it('does not swallow a database error — the route decides what to answer', async () => {
    state.allThrows = true;
    await expect(effectiveAccessForRole(db, 'viewer', catalogue)).rejects.toThrow();
  });
});

describe('list / add / remove', () => {
  it('lists every role and normalises the row (Date → ISO, effect narrowed)', async () => {
    state.rows.push({ ...row('viewer', 'deny'), created_at: new Date('2026-09-17T10:00:00Z'), note: 'why' });
    state.rows.push(row('analyst', 'allow', 'gap-analysis'));
    const rules = await listModuleAccessRules(db);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ role: 'viewer', moduleId: null, areaId: null, effect: 'deny', note: 'why', createdAt: '2026-09-17T10:00:00.000Z' });
    expect(rules[1]).toMatchObject({ role: 'analyst', moduleId: 'gap-analysis', areaId: null, effect: 'allow' });
  });

  it('add stores trimmed ids, blank → null, and refuses admin or an unknown effect', async () => {
    const rule = await addModuleAccessRule(db, { role: 'analyst', moduleId: '  gap-analysis ', areaId: '', effect: 'deny', note: ' n ', createdBy: 'u-1' });
    expect(rule).toMatchObject({ role: 'analyst', moduleId: 'gap-analysis', areaId: null, effect: 'deny', note: 'n', createdBy: 'u-1' });
    expect(state.rows[0]).toMatchObject({ id: rule.id, module_id: 'gap-analysis', area_id: null, created_by: 'u-1' });
    await expect(addModuleAccessRule(db, { role: 'admin' as 'viewer', effect: 'deny' })).rejects.toThrow(/role/);
    await expect(addModuleAccessRule(db, { role: 'viewer', effect: 'block' as 'deny' })).rejects.toThrow(/effect/);
  });
});

describe('pure helpers', () => {
  it('ruleScope: a row with both ids is a module rule', () => {
    expect(ruleScope({ moduleId: 'x', areaId: 'fcp' })).toBe('module');
    expect(ruleScope({ moduleId: null, areaId: 'fcp' })).toBe('area');
    expect(ruleScope({ moduleId: null, areaId: null })).toBe('all');
  });

  it('decideFromRules works on plain rule objects (no adapter)', () => {
    const rules: ModuleAccessRule[] = [
      { id: 'a', role: 'viewer', moduleId: null, areaId: null, effect: 'deny', note: null, createdBy: null, createdAt: '' },
      { id: 'b', role: 'viewer', moduleId: null, areaId: 'fcp', effect: 'allow', note: null, createdBy: null, createdAt: '' },
    ];
    expect(decideFromRules(rules, 'gap-analysis', 'fcp')).toEqual({ allowed: true, rule: { id: 'b', effect: 'allow', scope: 'area' }, reason: 'allowed by area rule' });
    expect(decideFromRules(rules, 'contract-review', 'legal').allowed).toBe(false);
    expect(decideFromRules([], 'x', 'y')).toEqual({ allowed: true, rule: null, reason: 'no rule — default open' });
  });
});
