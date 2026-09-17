/**
 * work-compliance-rules.test.ts — Wave 6 track E: the Work-output rules.
 *
 * Two properties, no database:
 *   - ensureWorkComplianceRules seeds once. A second boot inserts nothing; a
 *     seed whose text changed updates that row and leaves `active` alone.
 *   - every rule FIRES on a crafted bad output and PASSES on a good one,
 *     through the engine's own evaluator (evaluateRuleLogic) on the context
 *     the completion hook builds (buildWorkRuleContext) — so the regexes are
 *     tested as JSON, exactly as they sit in compliance_rules.rule_logic.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { evaluateRuleLogic, parseRuleLogic, type RuleEvaluation } from '../../server/services/compliance-rules.js';
import {
  WORK_COMPLIANCE_RULES,
  WORK_RULE_CODES,
  WORK_RULES_SQL,
  WORK_MIN_DELIVERABLE_CHARS,
  buildWorkRuleContext,
  buildWorkRecordContext,
  ensureWorkComplianceRules,
  type WorkRunInput,
} from '../../server/services/work-compliance-rules.js';

// ── Fake adapter for the seeder ─────────────────────────────────────────────

interface StoredRule {
  id: number; rule_code: string; title: string; description: string | null; severity: string;
  regulatory_source: string | null; rule_logic: string; remediation_steps: string | null; active: number;
}

function seedDb(initial: StoredRule[] = []) {
  const rules = [...initial];
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    all: async (sql: string) => {
      if (sql === WORK_RULES_SQL.existing) return rules.map((r) => ({ ...r }));
      return [];
    },
    get: async () => undefined,
    run: async (sql: string, ...args: unknown[]) => {
      runs.push({ sql, args });
      if (sql === WORK_RULES_SQL.insert) {
        const [rule_code, title, description, _category, severity, regulatory_source, rule_logic, remediation_steps] = args as string[];
        if (rules.some((r) => r.rule_code === rule_code)) return { changes: 0, lastInsertRowid: 0 };
        rules.push({ id: rules.length + 1, rule_code, title, description, severity, regulatory_source, rule_logic, remediation_steps, active: 1 });
        return { changes: 1, lastInsertRowid: rules.length };
      }
      if (sql === WORK_RULES_SQL.update) {
        const [title, description, severity, regulatory_source, rule_logic, remediation_steps, rule_code] = args as string[];
        const row = rules.find((r) => r.rule_code === rule_code);
        if (!row) return { changes: 0, lastInsertRowid: 0 };
        Object.assign(row, { title, description, severity, regulatory_source, rule_logic, remediation_steps });
        return { changes: 1, lastInsertRowid: row.id };
      }
      return { changes: 0, lastInsertRowid: 0 };
    },
  };
  return { db: db as unknown as DatabaseAdapter, rules, runs };
}

describe('ensureWorkComplianceRules — idempotent seed', () => {
  it('inserts the seven Work rules on an empty table and nothing on the next boot', async () => {
    const { db, rules, runs } = seedDb();
    const first = await ensureWorkComplianceRules(db);
    expect(first).toEqual({ inserted: 7, updated: 0, unchanged: 0 });
    expect(rules.map((r) => r.rule_code)).toEqual(WORK_RULE_CODES);
    // Every INSERT is ON CONFLICT (rule_code) DO NOTHING — the unique key is the guard.
    expect(runs.every((r) => r.sql === WORK_RULES_SQL.insert && /ON CONFLICT \(rule_code\) DO NOTHING/.test(r.sql))).toBe(true);

    runs.length = 0;
    const second = await ensureWorkComplianceRules(db);
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 7 });
    expect(runs).toHaveLength(0);
    expect(rules).toHaveLength(7);
  });

  it('updates a rule whose seed text changed, and does not write active/auto_remediate', async () => {
    const { db, rules, runs } = seedDb();
    await ensureWorkComplianceRules(db);
    const w2 = rules.find((r) => r.rule_code === 'WORK-002')!;
    w2.rule_logic = '{"type":"pattern","config":{"field":"text","pattern":"old"}}';
    w2.active = 0; // operator switched it off

    runs.length = 0;
    const res = await ensureWorkComplianceRules(db);
    expect(res).toEqual({ inserted: 0, updated: 1, unchanged: 6 });
    expect(runs).toHaveLength(1);
    expect(runs[0].sql).toBe(WORK_RULES_SQL.update);
    expect(runs[0].sql).not.toMatch(/active|auto_remediate/);
    expect(w2.rule_logic).toBe(JSON.stringify(WORK_COMPLIANCE_RULES[1].rule_logic));
    expect(w2.active).toBe(0);
  });

  it('never throws — a missing category (migration 278 not applied) is a warning and a result', async () => {
    const db = {
      all: async () => { throw new Error('new row for relation "compliance_rules" violates check constraint'); },
      get: async () => undefined,
      run: async () => ({ changes: 0, lastInsertRowid: 0 }),
    } as unknown as DatabaseAdapter;
    const res = await ensureWorkComplianceRules(db);
    expect(res.inserted).toBe(0);
    expect(res.error).toMatch(/check constraint/);
  });

  it('every seed is valid rule_logic for the engine and has remediation text', () => {
    for (const seed of WORK_COMPLIANCE_RULES) {
      expect(() => parseRuleLogic(JSON.stringify(seed.rule_logic))).not.toThrow();
      expect(seed.remediation_steps.length).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(seed.severity);
    }
  });
});

// ── Each rule on a bad and a good output ─────────────────────────────────────

const GOOD_BODY = [
  '# Assessment of the proposed customer due diligence process',
  '',
  'The proposed process satisfies Article 20 AMLR for standard-risk customers and',
  'Regulation (EU) 2024/1624 Art. 22 for enhanced measures. The onboarding workflow',
  'identifies the beneficial owner at the 25% threshold (source: AMLR Art. 51).',
  'The estimated remediation cost is EUR 40,000 — an assumption based on comparable',
  'engagements, not verified against the client\'s own figures.',
  '',
  '## Recommendations',
  '',
  '1. Update the CDD policy to reference Article 20 explicitly.',
  '2. Train the onboarding team on the beneficial-ownership threshold.',
  '3. Re-run the assessment after the policy is board-approved.',
  '',
  '**Sources, assumptions and what was not checked**',
  '',
  '- Sources: AMLR (Regulation (EU) 2024/1624), the client\'s draft policy.',
  '- Assumptions: the client is an obliged entity under Art. 3.',
  '- Not checked: the group structure beyond the first tier.',
].join('\n');

function input(overrides: Partial<WorkRunInput> = {}): WorkRunInput {
  return {
    sessionId: 's1', messageId: 'm1', moduleId: 'cdd-process-review', areaId: 'fcp',
    model: 'sdk:claude-opus-5', text: GOOD_BODY, provenanceContract: true, ...overrides,
  };
}

function run(code: string, i: WorkRunInput): RuleEvaluation {
  const seed = WORK_COMPLIANCE_RULES.find((r) => r.rule_code === code);
  if (!seed) throw new Error(`no seed ${code}`);
  return evaluateRuleLogic(parseRuleLogic(JSON.stringify(seed.rule_logic)), buildWorkRuleContext(i));
}

describe('the good output passes every Work rule', () => {
  for (const code of WORK_RULE_CODES) {
    it(`${code} passes`, () => {
      expect(run(code, input())).toMatchObject({ result: 'pass', findings: [] });
    });
  }
});

describe('WORK-001 provenance section', () => {
  it('fires when the run promised a provenance section and the output has none', () => {
    const text = GOOD_BODY.split('**Sources, assumptions')[0];
    const r = run('WORK-001', input({ text }));
    expect(r.result).toBe('fail');
    expect(r.findings[0].description).toMatch(/Sources, assumptions and what was not checked/);
  });

  it('accepts an equivalent heading (## Sources and limitations)', () => {
    const text = `${GOOD_BODY.split('**Sources, assumptions')[0]}\n## Sources and limitations\n- none`;
    expect(run('WORK-001', input({ text })).result).toBe('pass');
  });

  it('does not apply when the run did not compose the contract', () => {
    const text = GOOD_BODY.split('**Sources, assumptions')[0];
    expect(run('WORK-001', input({ text, provenanceContract: false })).result).toBe('pass');
  });
});

describe('WORK-002 placeholders', () => {
  it('fires on TODO / TBD / [insert / lorem ipsum, once per distinct placeholder', () => {
    const text = `${GOOD_BODY}\n\nTODO: confirm with client. Fee: TBD. Dear [insert client name], lorem ipsum dolor. TODO again.`;
    const r = run('WORK-002', input({ text }));
    expect(r.result).toBe('fail');
    expect(r.findings.map((f) => f.description)).toEqual([
      'Placeholder left in the output: TODO',
      'Placeholder left in the output: TBD',
      'Placeholder left in the output: [insert',
      'Placeholder left in the output: lorem ipsum',
    ]);
  });

  it('is case-sensitive for the word markers — Spanish "todo" is not a placeholder', () => {
    expect(run('WORK-002', input({ text: `${GOOD_BODY}\n\nRevisamos todo el proceso de diligencia debida.` })).result).toBe('pass');
  });
});

describe('WORK-003 citation in a regulated area', () => {
  const uncited = [
    '# Review', '',
    'The process is broadly adequate. The onboarding team identifies owners and screens them.',
    'We recommend a policy refresh and training. '.repeat(6),
    '', '**Sources, assumptions and what was not checked**', '- internal review only',
  ].join('\n');

  it('fires for fcp / legal / tax / data-privacy / payments-dora with no reference', () => {
    for (const areaId of ['fcp', 'legal', 'tax', 'data-privacy', 'payments-dora']) {
      const r = run('WORK-003', input({ text: uncited, areaId }));
      expect(r.result, areaId).toBe('fail');
      expect(r.findings[0].description).toMatch(/No article, section or regulation reference/);
    }
  });

  it('accepts § / Section / a named regulation', () => {
    expect(run('WORK-003', input({ text: `${uncited}\nSee § 12 of the Act.` })).result).toBe('pass');
    expect(run('WORK-003', input({ text: `${uncited}\nSection 7 applies.` })).result).toBe('pass');
    expect(run('WORK-003', input({ text: `${uncited}\nGDPR governs this.`, areaId: 'data-privacy' })).result).toBe('pass');
  });

  it('does not apply outside the regulated areas', () => {
    expect(run('WORK-003', input({ text: uncited, areaId: 'hr' })).result).toBe('pass');
    expect(run('WORK-003', input({ text: uncited, areaId: null })).result).toBe('pass');
  });
});

describe('WORK-004 length floor', () => {
  const short = 'Yes — the threshold is 25% (AMLR Art. 51).\n\n**Sources, assumptions and what was not checked**\n- AMLR';

  it('fires below the floor for a deliverable module', () => {
    expect(short.length).toBeLessThan(WORK_MIN_DELIVERABLE_CHARS);
    const r = run('WORK-004', input({ text: short }));
    expect(r.result).toBe('fail');
    expect(r.findings[0].description).toMatch(/Output length \(chars\) \(\d+\) is below threshold 400/);
  });

  it('exempts the Quick Briefing format and short-form module ids', () => {
    expect(run('WORK-004', input({ text: short, outputFormats: ['quick-briefing'] })).result).toBe('pass');
    expect(run('WORK-004', input({ text: short, moduleId: 'legal-brief' })).result).toBe('pass');
    expect(run('WORK-004', input({ text: short, moduleId: 'media-briefing' })).result).toBe('pass');
  });
});

describe('WORK-005 model allow-list', () => {
  it('passes when there is no allow-list at all', () => {
    expect(run('WORK-005', input({ allowedModels: [] })).result).toBe('pass');
    expect(run('WORK-005', input({ allowedModels: undefined })).result).toBe('pass');
  });

  it('fires when an allow-list exists and the model is not on it', () => {
    const r = run('WORK-005', input({ model: 'mistral-large-latest', allowedModels: ['claude-opus-4-8', 'sdk:claude-opus-5'] }));
    expect(r.result).toBe('fail');
    expect(r.findings[0].description).toBe("model 'mistral-large-latest' is not on the allow-list (2 permitted)");
  });

  it('accepts the bare Claude id behind an sdk: prefix', () => {
    expect(run('WORK-005', input({ model: 'sdk:claude-opus-5', allowedModels: ['claude-opus-5'] })).result).toBe('pass');
    expect(run('WORK-005', input({ model: 'sdk:claude-opus-5', allowedModels: ['sdk:claude-opus-5'] })).result).toBe('pass');
  });
});

describe('WORK-006 unverified figure', () => {
  it('fires per section that carries a figure and no marker, naming the section', () => {
    const text = [
      '# Cost model', '',
      'The programme will cost EUR 1.2m over two years and reduce false positives by 35%.',
      '', '## Timeline', '',
      'Phase one takes six months. Phase two is an estimate: 40% of the effort.',
      '', '## Sources', '- client budget (source: CFO)',
    ].join('\n');
    const r = run('WORK-006', input({ text }));
    expect(r.result).toBe('fail');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].description).toBe('Figure with no verification marker in section "Cost model": "EUR 1.2m"');
  });

  it('passes when every figure sits in a section with a marker', () => {
    const text = '# Costs\n\nRoughly $50,000 — an assumption, not verified.\n\n## Share\n\n35% (source: annual report 2025).';
    expect(run('WORK-006', input({ text })).result).toBe('pass');
  });
});

describe('WORK-007 secret leakage', () => {
  const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
  const iban = 'SE4550000000058398257466';

  it('fires on an API key and an IBAN, and REDACTS them in the finding', () => {
    const r = run('WORK-007', input({ text: `${GOOD_BODY}\n\nUse ${key} for the sandbox. Pay to ${iban}.` }));
    expect(r.result).toBe('fail');
    expect(r.findings).toHaveLength(2);
    for (const f of r.findings) {
      expect(f.description).not.toContain(key);
      expect(f.description).not.toContain(iban);
      expect(f.description).toMatch(/^Possible secret or account identifier in the output: .{4}…\(\d+ chars, redacted\)$/);
    }
  });

  it('fires on a private key block and a JWT', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(run('WORK-007', input({ text: `${GOOD_BODY}\n${pem}` })).result).toBe('fail');
    expect(run('WORK-007', input({ text: `${GOOD_BODY}\nToken: ${jwt}` })).result).toBe('fail');
  });

  it('does not fire on regulation numbers, ISO references or ordinary prose', () => {
    const text = `${GOOD_BODY}\nISO 27001, Regulation (EU) 2022/2554 (DORA), PSD2, reference AB-2024-0017, and EU2024 are not secrets.`;
    expect(run('WORK-007', input({ text })).result).toBe('pass');
  });
});

describe('buildWorkRuleContext / buildWorkRecordContext', () => {
  it('derives the fields the rules read', () => {
    const ctx = buildWorkRuleContext(input({ outputFormats: ['quick-briefing'], allowedModels: ['a'] }));
    expect(ctx).toMatchObject({
      sessionId: 's1', messageId: 'm1', moduleId: 'cdd-process-review', areaId: 'fcp',
      model: 'sdk:claude-opus-5', modelBare: 'claude-opus-5', textLength: GOOD_BODY.length,
      provenanceContract: true, regulatedArea: true, quickBriefing: true, allowedModels: ['a'],
    });
  });

  it('the persisted context carries ids and facts, never the output text', () => {
    const rec = buildWorkRecordContext(buildWorkRuleContext(input({ allowedModels: ['a', 'b'] })));
    expect(rec).not.toHaveProperty('text');
    expect(rec).not.toHaveProperty('allowedModels');
    expect(rec).toMatchObject({ trigger: 'completion', sessionId: 's1', messageId: 'm1', textLength: GOOD_BODY.length, allowedModelCount: 2 });
    expect(JSON.stringify(rec)).not.toContain('Assessment of the proposed');
  });
});
