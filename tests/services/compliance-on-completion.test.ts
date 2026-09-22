/**
 * compliance-on-completion.test.ts — Wave 6 track E: the Work rules run when a
 * module run completes, and what they find is recorded.
 *
 * Against an in-memory fake adapter holding the seven seeded Work rules (no
 * database):
 *   - the setting defaults ON when absent; 'false' / '0' / 'off' turn it off;
 *   - an output under 200 chars is skipped without touching the rules;
 *   - a run writes one rule_executions row per active 'work' rule, with the
 *     message id in execution_context (and never the output text), and one
 *     rule_violations row per finding with affected_entity = message id;
 *   - an inactive rule is not executed;
 *   - the allow-list comes from model_allowed (global + the session owner);
 *   - a failing database returns ran:false with a reason — it never throws.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  COMPLIANCE_ON_COMPLETION_SETTING_KEY,
  COMPLIANCE_ON_COMPLETION_SQL,
  isComplianceOnCompletionEnabled,
  parseComplianceOnCompletion,
  runComplianceOnCompletion,
  setComplianceOnCompletion,
  type ComplianceOnCompletionInput,
} from '../../server/services/compliance-on-completion.js';
import { WORK_COMPLIANCE_RULES } from '../../server/services/work-compliance-rules.js';

interface Execution { id: number; rule_id: number; execution_context: string; result: string; findings: string | null; auto_remediated: number; executed_at: string }
interface Violation { id: number; rule_id: number; execution_id: number; severity: string; description: string; affected_entity: string; remediation_status: string }

interface FakeState {
  settings: Map<string, string>;
  rules: Array<Record<string, unknown>>;
  executions: Execution[];
  violations: Violation[];
  sessionUser: string | null;
  allowed: Array<{ user_id: string | null; model_id: string }>;
  failOn: RegExp | null;
}

function freshState(): FakeState {
  return {
    settings: new Map(),
    rules: WORK_COMPLIANCE_RULES.map((seed, i) => ({
      id: 100 + i, rule_code: seed.rule_code, title: seed.title, description: seed.description,
      category: 'work', severity: seed.severity, regulatory_source: seed.regulatory_source,
      rule_logic: JSON.stringify(seed.rule_logic), active: 1, auto_remediate: 0,
      remediation_steps: JSON.stringify(seed.remediation_steps),
    })),
    executions: [],
    violations: [],
    sessionUser: 'u1',
    allowed: [],
    failOn: null,
  };
}

function fakeDb(state: FakeState): DatabaseAdapter {
  const guard = (sql: string) => { if (state.failOn?.test(sql)) throw new Error('connection terminated'); };
  const db = {
    get: async (sql: string, ...args: unknown[]) => {
      guard(sql);
      if (sql === COMPLIANCE_ON_COMPLETION_SQL.read) {
        const v = state.settings.get(String(args[0]));
        return v === undefined ? undefined : { value: v };
      }
      if (sql === COMPLIANCE_ON_COMPLETION_SQL.sessionUser) return { user_id: state.sessionUser };
      if (sql.startsWith('SELECT * FROM rule_executions WHERE id = ?')) return state.executions.find((e) => e.id === Number(args[0]));
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => {
      guard(sql);
      if (sql === COMPLIANCE_ON_COMPLETION_SQL.allowedModels) {
        return state.allowed.filter((r) => r.user_id === null || r.user_id === args[0]).map((r) => ({ model_id: r.model_id }));
      }
      if (sql.includes('FROM compliance_rules WHERE category = ?')) return state.rules.filter((r) => r.category === args[0]);
      return [];
    },
    run: async (sql: string, ...args: unknown[]) => {
      guard(sql);
      if (sql === COMPLIANCE_ON_COMPLETION_SQL.upsert) {
        state.settings.set(String(args[0]), String(args[1]));
        return { changes: 1, lastInsertRowid: 0 };
      }
      if (sql.includes('INSERT INTO rule_executions')) {
        const id = state.executions.length + 1;
        const errorRow = sql.includes("'error'");
        state.executions.push({
          id, rule_id: Number(args[0]), execution_context: String(args[1]),
          result: errorRow ? 'error' : String(args[2]),
          findings: errorRow ? String(args[2]) : String(args[3]),
          auto_remediated: errorRow ? 0 : Number(args[4]), executed_at: new Date().toISOString(),
        });
        return { changes: 1, lastInsertRowid: id };
      }
      if (sql.includes('INSERT INTO rule_violations')) {
        const id = state.violations.length + 1;
        state.violations.push({
          id, rule_id: Number(args[0]), execution_id: Number(args[1]), severity: String(args[2]),
          description: String(args[3]), affected_entity: String(args[4]), remediation_status: String(args[5]),
        });
        return { changes: 1, lastInsertRowid: id };
      }
      return { changes: 0, lastInsertRowid: 0 };
    },
  };
  return db as unknown as DatabaseAdapter;
}

/** A regulated-area deliverable that breaks WORK-001, WORK-002, WORK-003 and WORK-007. */
const BAD_TEXT = [
  '# Onboarding review',
  '',
  'The onboarding process is broadly adequate for the client. TODO: confirm scope with the MLRO.',
  'We recommend refreshing the policy and running training for the operations team this quarter.',
  'Use the sandbox key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 for the integration tests.',
  'The team should revisit the screening thresholds after the next supervisory visit concludes.',
  'Ownership records were sampled for the larger corporate clients and found to be broadly complete.',
].join('\n');

function input(overrides: Partial<ComplianceOnCompletionInput> = {}): ComplianceOnCompletionInput {
  return {
    sessionId: 'sess-1', messageId: 'msg-1', moduleId: 'onboarding-review', areaId: 'fcp',
    model: 'sdk:claude-opus-5', text: BAD_TEXT, provenanceContract: true, ...overrides,
  };
}

let state: FakeState;
let db: DatabaseAdapter;
beforeEach(() => {
  state = freshState();
  db = fakeDb(state);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the compliance_on_completion setting', () => {
  it('is ON when the row is absent (owner decision: on by default)', async () => {
    expect(await isComplianceOnCompletionEnabled(db)).toBe(true);
  });

  it('parses off-words as off and anything else as on', () => {
    for (const v of ['false', '0', 'off', 'OFF', ' no ', 'disabled']) expect(parseComplianceOnCompletion(v), v).toBe(false);
    for (const v of ['true', '1', 'on', 'yes', '']) expect(parseComplianceOnCompletion(v), v).toBe(true);
    expect(parseComplianceOnCompletion(undefined)).toBe(true);
    expect(parseComplianceOnCompletion(null)).toBe(true);
  });

  it('round-trips through setComplianceOnCompletion', async () => {
    await setComplianceOnCompletion(db, false);
    expect(state.settings.get(COMPLIANCE_ON_COMPLETION_SETTING_KEY)).toBe('false');
    expect(await isComplianceOnCompletionEnabled(db)).toBe(false);
    await setComplianceOnCompletion(db, true);
    expect(await isComplianceOnCompletionEnabled(db)).toBe(true);
  });
});

describe('runComplianceOnCompletion', () => {
  it('does nothing when switched off', async () => {
    state.settings.set(COMPLIANCE_ON_COMPLETION_SETTING_KEY, 'off');
    expect(await runComplianceOnCompletion(db, input())).toEqual({ ran: false, executions: 0, violations: 0, reason: 'disabled' });
    expect(state.executions).toHaveLength(0);
  });

  it('skips an output shorter than 200 chars', async () => {
    const res = await runComplianceOnCompletion(db, input({ text: 'I cannot help with that.' }));
    expect(res.ran).toBe(false);
    expect(res.reason).toMatch(/shorter than 200/);
    expect(state.executions).toHaveLength(0);
  });

  it('writes one execution per Work rule and one violation per finding, keyed to the message', async () => {
    expect(BAD_TEXT.length).toBeGreaterThanOrEqual(400); // so WORK-004 is a pass by construction
    const res = await runComplianceOnCompletion(db, input());
    expect(res.ran).toBe(true);
    expect(res.executions).toBe(7);
    expect(state.executions).toHaveLength(7);

    const byCode = (code: string) => {
      const rule = state.rules.find((r) => r.rule_code === code)!;
      return state.executions.find((e) => e.rule_id === rule.id)!;
    };
    expect(byCode('WORK-001').result).toBe('fail');   // no provenance section
    expect(byCode('WORK-002').result).toBe('fail');   // TODO
    expect(byCode('WORK-003').result).toBe('fail');   // fcp, no citation
    expect(byCode('WORK-004').result).toBe('pass');   // over 400 chars
    expect(byCode('WORK-005').result).toBe('pass');   // no allow-list
    expect(byCode('WORK-006').result).toBe('pass');   // no figures
    expect(byCode('WORK-007').result).toBe('fail');   // API key

    expect(res.violations).toBe(4);
    expect(state.violations).toHaveLength(4);
    for (const v of state.violations) {
      expect(v.affected_entity).toBe('msg-1');
      expect(v.remediation_status).toBe('open');
    }
    const secret = state.violations.find((v) => v.description.startsWith('Possible secret'))!;
    expect(secret.severity).toBe('high');
    expect(secret.description).not.toContain('abcdefghijklmnop');

    for (const e of state.executions) {
      const ctx = JSON.parse(e.execution_context) as Record<string, unknown>;
      expect(ctx).toMatchObject({ trigger: 'completion', sessionId: 'sess-1', messageId: 'msg-1', moduleId: 'onboarding-review', areaId: 'fcp' });
      expect(e.execution_context).not.toContain('onboarding process is broadly adequate');
      expect(e.execution_context).not.toContain('sk-ant-');
    }
  });

  it('skips a rule the operator switched off', async () => {
    state.rules.find((r) => r.rule_code === 'WORK-002')!.active = 0;
    const res = await runComplianceOnCompletion(db, input());
    expect(res.executions).toBe(6);
    expect(res.violations).toBe(3);
  });

  it('reads the allow-list from model_allowed (global rows and the session owner only)', async () => {
    state.allowed = [
      { user_id: null, model_id: 'claude-opus-4-8' },
      { user_id: 'someone-else', model_id: 'sdk:claude-opus-5' },
    ];
    await runComplianceOnCompletion(db, input());
    const w5 = state.rules.find((r) => r.rule_code === 'WORK-005')!;
    const exec = state.executions.find((e) => e.rule_id === w5.id)!;
    expect(exec.result).toBe('fail');
    expect(JSON.parse(exec.execution_context)).toMatchObject({ allowedModelCount: 1 });

    state.executions = []; state.violations = [];
    state.allowed.push({ user_id: 'u1', model_id: 'sdk:claude-opus-5' });
    await runComplianceOnCompletion(db, input());
    expect(state.executions.find((e) => e.rule_id === w5.id)!.result).toBe('pass');
  });

  it('records a malformed rule as an error execution and still runs the rest', async () => {
    state.rules.find((r) => r.rule_code === 'WORK-004')!.rule_logic = '{not json';
    const res = await runComplianceOnCompletion(db, input());
    expect(res.executions).toBe(7);
    expect(state.executions.filter((e) => e.result === 'error')).toHaveLength(1);
  });

  it('never throws — a database failure is ran:false with a reason', async () => {
    state.failOn = /app_settings/;
    await expect(runComplianceOnCompletion(db, input())).resolves.toEqual({
      ran: false, executions: 0, violations: 0, reason: 'connection terminated',
    });
    state.failOn = /model_allowed/;
    const res = await runComplianceOnCompletion(db, input());
    expect(res.ran).toBe(false);
    expect(res.reason).toBe('connection terminated');
  });
});
