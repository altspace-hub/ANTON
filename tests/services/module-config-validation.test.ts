/**
 * module-config-validation.test.ts — Wave 0 track B.
 *
 * `module.json` is read with fs.readJson and cast to ModuleConfig, so nothing
 * on disk is ever seen by TypeScript. Until this wave the loader validated one
 * field (recommendedSkills) and everything else shipped unchecked: 30 guided
 * inputs declared a `type` the renderer has no branch for ('multiselect',
 * 'toggle') so the label drew and the control did not, and two modules declared
 * a contentType safeContentType() silently downgraded.
 *
 * This file pins validateModuleConfig() against fixtures for each of those
 * shapes, and then walks the real 560-module catalogue to pin that the classes
 * it catches are at zero. It does NOT re-assert defaults.outputFormats across
 * the catalogue — tests/lib/module-area-integrity.test.ts already owns that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { ModuleConfig } from '../../server/types/area-config.js';
import { OUTPUT_FORMATS } from '../../src/lib/output-format-definitions.js';
import { CONTENT_TYPES } from '../../server/schemas/content-types/index.js';

type Loader = typeof import('../../server/services/module-loader.js');
let loader: Loader;

beforeAll(async () => {
  // module-loader starts a recursive fs.watch on server/areas outside
  // production; keep that out of the test worker (same guard as
  // tests/lib/module-area-integrity.test.ts).
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    loader = await import('../../server/services/module-loader.js');
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  loader.resetModuleConfigWarningsForTests();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

/** A module.json that passes every check, with the one field under test swapped. */
function config(overrides: Record<string, unknown> = {}): ModuleConfig {
  return {
    id: 'fixture-module',
    label: 'Fixture Module',
    shortLabel: 'Fixture',
    icon: 'FileText',
    description: 'A module that exists only in this test.',
    color: '#2DD4A8',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary'],
    },
    guidedInputs: [
      { id: 'scope', type: 'text', label: 'Scope' },
      { id: 'areas', type: 'multi-select', label: 'Areas', options: [{ value: 'a', label: 'A' }] },
    ],
    recommendedPersonas: ['fcp-expert'],
    contentType: 'analytic_report',
    ...overrides,
  } as unknown as ModuleConfig;
}

/** One guided input on an otherwise clean module. */
function withField(field: unknown, id = 'fixture-module'): ModuleConfig {
  return config({ id, guidedInputs: [field] });
}

function kinds(problems: Array<{ kind: string }>): string[] {
  return problems.map((p) => p.kind);
}

describe('validateModuleConfig — a clean config', () => {
  it('reports nothing and warns nothing', () => {
    expect(loader.validateModuleConfig(config())).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('accepts every renderable field type, and every content type', () => {
    for (const type of ['text', 'textarea', 'boolean', 'number']) {
      expect(kinds(loader.validateModuleConfig(withField({ id: 'f', type, label: 'F' }, `clean-${type}`)))).toEqual([]);
    }
    for (const type of ['select', 'multi-select', 'chips']) {
      const field = { id: 'f', type, label: 'F', options: [{ value: 'a', label: 'A' }] };
      expect(kinds(loader.validateModuleConfig(withField(field, `clean-${type}`)))).toEqual([]);
    }
    for (const contentType of CONTENT_TYPES) {
      expect(kinds(loader.validateModuleConfig(config({ id: `clean-${contentType}`, contentType })))).toEqual([]);
    }
  });

  it('accepts a module with no guidedInputs, no contentType and no personas', () => {
    const bare = config({ id: 'bare' });
    delete (bare as unknown as Record<string, unknown>).guidedInputs;
    delete (bare as unknown as Record<string, unknown>).contentType;
    delete (bare as unknown as Record<string, unknown>).recommendedPersonas;
    expect(loader.validateModuleConfig(bare)).toEqual([]);
  });
});

describe('validateModuleConfig — guided input types', () => {
  // The 27 live 'multiselect' fields. FieldType has no such member; the
  // renderer has no branch; the field drew a label and nothing else.
  it("reports 'multiselect' as an unknown type, not an unrenderable one", () => {
    const problems = loader.validateModuleConfig(withField({ id: 'areas', type: 'multiselect', label: 'Areas', options: [{ value: 'a', label: 'A' }] }));
    expect(kinds(problems)).toEqual(['field-type-unknown']);
    expect(problems[0].detail).toContain("'multiselect'");
    expect(problems[0].detail).toContain('areas');
  });

  // The 3 live 'toggle' fields — the correct spelling is 'boolean'.
  it("reports 'toggle' as an unknown type", () => {
    const problems = loader.validateModuleConfig(withField({ id: 'include_appendix', type: 'toggle', label: 'Include appendix' }));
    expect(kinds(problems)).toEqual(['field-type-unknown']);
    expect(problems[0].detail).toContain("'toggle'");
  });

  // 'file' IS a FieldType — DynamicModule.tsx simply never grew a branch for
  // it. A different bug from a typo, so it gets its own kind.
  it("reports 'file' as declared-but-unrenderable, distinctly from an unknown type", () => {
    const problems = loader.validateModuleConfig(withField({ id: 'upload', type: 'file', label: 'Upload' }));
    expect(kinds(problems)).toEqual(['field-type-unrenderable']);
    expect(kinds(problems)).not.toContain('field-type-unknown');
    expect(problems[0].detail).toContain('DynamicModule');
  });

  it('reports a missing or non-string type as unknown', () => {
    expect(kinds(loader.validateModuleConfig(withField({ id: 'a', label: 'A' }, 'no-type')))).toEqual(['field-type-unknown']);
    expect(kinds(loader.validateModuleConfig(withField({ id: 'a', type: 7, label: 'A' }, 'num-type')))).toEqual(['field-type-unknown']);
  });

  it('does not mistake an inherited Object.prototype key for a field type', () => {
    // A Record lookup by a raw string would answer 'constructor' with a truthy
    // value and wave the field through.
    for (const type of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(kinds(loader.validateModuleConfig(withField({ id: 'a', type, label: 'A' }, `proto-${type}`))))
        .toEqual(['field-type-unknown']);
    }
  });
});

describe('validateModuleConfig — options', () => {
  it('reports a select / multi-select / chips shipped without options', () => {
    for (const type of ['select', 'multi-select', 'chips']) {
      const problems = loader.validateModuleConfig(withField({ id: 'pick', type, label: 'Pick' }, `noopts-${type}`));
      expect(kinds(problems), type).toEqual(['field-options-missing']);
      expect(problems[0].detail).toContain('pick');
    }
  });

  it('reports an empty options array the same way', () => {
    const problems = loader.validateModuleConfig(withField({ id: 'pick', type: 'select', label: 'Pick', options: [] }));
    expect(kinds(problems)).toEqual(['field-options-missing']);
  });

  it('does not require options on a free-text field', () => {
    expect(kinds(loader.validateModuleConfig(withField({ id: 'notes', type: 'textarea', label: 'Notes' })))).toEqual([]);
  });
});

describe('validateModuleConfig — field ids', () => {
  it('reports a duplicate guided input id', () => {
    const problems = loader.validateModuleConfig(config({
      guidedInputs: [
        { id: 'scope', type: 'text', label: 'Scope' },
        { id: 'scope', type: 'textarea', label: 'Scope again' },
      ],
    }));
    expect(kinds(problems)).toEqual(['field-id-duplicate']);
    expect(problems[0].detail).toContain("'scope'");
  });

  it('reports a field with no id', () => {
    expect(kinds(loader.validateModuleConfig(withField({ type: 'text', label: 'Nameless' })))).toEqual(['field-id-missing']);
  });

  it('does not report two different ids', () => {
    expect(loader.validateModuleConfig(config())).toEqual([]);
  });
});

describe('validateModuleConfig — defaults', () => {
  it('reports an invalid thinking level', () => {
    const problems = loader.validateModuleConfig(config({
      defaults: { thinking: 'think_really_hard', creativity: 'balanced', outputFormats: ['executive-summary'] },
    }));
    expect(kinds(problems)).toEqual(['thinking-invalid']);
    expect(problems[0].detail).toContain('think_really_hard');
  });

  it("accepts 'deep_investigate' — the sixth level ModuleDefaults used to omit", () => {
    const cfg = config({
      id: 'deepest',
      defaults: { thinking: 'deep_investigate', creativity: 'balanced', outputFormats: ['executive-summary'] },
    });
    expect(loader.validateModuleConfig(cfg)).toEqual([]);
    // And the type accepts it too, which is the half a runtime check cannot see.
    const typed: ModuleConfig['defaults']['thinking'] = 'deep_investigate';
    expect(typed).toBe('deep_investigate');
  });

  it('reports an invalid creativity value', () => {
    const problems = loader.validateModuleConfig(config({
      defaults: { thinking: 'think', creativity: 'very-creative', outputFormats: ['executive-summary'] },
    }));
    expect(kinds(problems)).toEqual(['creativity-invalid']);
  });

  it('reports an output format id no OUTPUT_FORMATS entry has', () => {
    const problems = loader.validateModuleConfig(config({
      defaults: { thinking: 'think', creativity: 'balanced', outputFormats: ['executive-summary', 'risk-registry'] },
    }));
    expect(kinds(problems)).toEqual(['output-format-unknown']);
    expect(problems[0].detail).toContain('risk-registry');
  });

  it('accepts every id the format registry actually serves', () => {
    expect(OUTPUT_FORMATS.length).toBeGreaterThan(40);
    const problems = loader.validateModuleConfig(config({
      defaults: { thinking: 'think', creativity: 'balanced', outputFormats: OUTPUT_FORMATS.map((f) => f.id) },
    }));
    expect(problems).toEqual([]);
  });

  it('reports malformed defaults without throwing', () => {
    expect(kinds(loader.validateModuleConfig(config({ id: 'nodef', defaults: undefined }))))
      .toContain('defaults-malformed');
    expect(kinds(loader.validateModuleConfig(config({ id: 'arrdef', defaults: [] }))))
      .toContain('defaults-malformed');
    expect(kinds(loader.validateModuleConfig(config({
      id: 'strfmt',
      defaults: { thinking: 'think', creativity: 'balanced', outputFormats: 'executive-summary' },
    })))).toEqual(['output-formats-malformed']);
  });
});

describe('validateModuleConfig — contentType', () => {
  it("reports 'decision_memo' — the value fcp-scope-assessor shipped", () => {
    const problems = loader.validateModuleConfig(config({ contentType: 'decision_memo' }));
    expect(kinds(problems)).toEqual(['content-type-invalid']);
    expect(problems[0].detail).toContain('decision_memo');
    expect(problems[0].detail).toContain('analytic_report');
  });

  it("reports 'appetite_statement' — the value atlas-company-appetite-consolidator shipped", () => {
    expect(kinds(loader.validateModuleConfig(config({ contentType: 'appetite_statement' }))))
      .toEqual(['content-type-invalid']);
  });

  it('reports a non-string contentType', () => {
    expect(kinds(loader.validateModuleConfig(config({ contentType: 3 })))).toEqual(['content-type-invalid']);
  });
});

describe('validateModuleConfig — personas', () => {
  it('reports an id no persona registry the composer reads can resolve', () => {
    const problems = loader.validateModuleConfig(config({ recommendedPersonas: ['no-such-persona'] }));
    expect(kinds(problems)).toEqual(['persona-unknown']);
    expect(problems[0].detail).toContain('no-such-persona');
  });

  it('accepts an id that resolves from either registry, not just one', () => {
    // 'ct-ux-expert' exists only in prompt-builder's server map;
    // 'sanctions-lawyer' only in the client picker registry. Both resolve
    // through resolvePersonaInstruction(), so neither may be reported.
    expect(loader.validateModuleConfig(config({ id: 'p-server', recommendedPersonas: ['ct-ux-expert'] }))).toEqual([]);
    expect(loader.validateModuleConfig(config({ id: 'p-client', recommendedPersonas: ['sanctions-lawyer'] }))).toEqual([]);
  });

  it('reports a malformed recommendedPersonas', () => {
    expect(kinds(loader.validateModuleConfig(config({ recommendedPersonas: 'fcp-expert' }))))
      .toEqual(['personas-malformed']);
  });
});

describe('validateModuleConfig — robustness and warning volume', () => {
  it('never throws, whatever is on disk', () => {
    const junk: unknown[] = [
      null,
      undefined,
      'a string',
      42,
      [],
      { id: 'weird', guidedInputs: 'not-an-array' },
      { id: 'weirder', guidedInputs: [null, 7, 'x'] },
      {},
    ];
    for (const value of junk) {
      expect(() => loader.validateModuleConfig(value as ModuleConfig)).not.toThrow();
    }
  });

  it('reports a module.json that is not an object at all', () => {
    for (const value of [null, 'a string', 42, []]) {
      expect(kinds(loader.validateModuleConfig(value as ModuleConfig)), String(value)).toEqual(['config-malformed']);
    }
  });

  it('warns once per module, however often the config is re-validated', () => {
    const broken = config({ id: 'repeatedly-loaded', contentType: 'decision_memo' });
    for (let i = 0; i < 5; i++) expect(loader.validateModuleConfig(broken)).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('caps how many modules print, so one systemic defect cannot flood a boot', () => {
    for (let i = 0; i < 100; i++) {
      loader.validateModuleConfig(config({ id: `flood-${i}`, contentType: 'nope' }));
    }
    // 20 per-module warnings + one suppression notice.
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(21);
    expect(warnSpy.mock.calls.length).toBeGreaterThan(1);
    const last = String(warnSpy.mock.calls[warnSpy.mock.calls.length - 1][0]);
    expect(last).toContain('suppressed');
  });
});

describe('the shipped catalogue', () => {
  /**
   * recommendedPersonas ids that resolve nowhere the prompt composer reads.
   *
   * The backlog is EMPTY as of Wave 1 track G. It held four ids —
   * 'crypto-blockchain-expert', 'risk-coach', 'senior-risk-officer',
   * 'senior-mlro' — recommended by 21 modules (all 11 blockchain modules, the
   * 7 Risk Atlas stages, fcp/business-wide-risk-assessment and
   * fcp/fcp-scope-assessor). Three had text in registries the run path does not
   * read (personas-manager's BUILTIN_PERSONAS and server/personas/<id>/); the
   * fourth had none. All four now live in EXPERT_ROLE_INSTRUCTIONS
   * (prompt-builder.ts) and EXPERT_ROLES (src/lib/expert-roles.ts).
   *
   * Keep it empty. Re-adding an id here would let exactly that defect ship
   * again — a persona ModulePage auto-applies that injects nothing, silently.
   * tests/services/persona-registry-parity.test.ts pins the fix from the
   * registry side.
   */
  const KNOWN_DEAD_PERSONA_IDS = new Set<string>([
    'crypto-blockchain-expert', 'senior-risk-officer', 'risk-coach', 'senior-mlro',
  ]);

  function everyModuleConfig(): Array<{ where: string; config: ModuleConfig }> {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const areasDir = path.join(repoRoot, 'server', 'areas');
    const out: Array<{ where: string; config: ModuleConfig }> = [];
    for (const areaEntry of fs.readdirSync(areasDir, { withFileTypes: true })) {
      if (!areaEntry.isDirectory()) continue;
      const modulesDir = path.join(areasDir, areaEntry.name, 'modules');
      if (!fs.existsSync(modulesDir)) continue;
      for (const modEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
        if (!modEntry.isDirectory()) continue;
        const configPath = path.join(modulesDir, modEntry.name, 'module.json');
        if (!fs.existsSync(configPath)) continue;
        out.push({
          where: `${areaEntry.name}/${modEntry.name}`,
          config: JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ModuleConfig,
        });
      }
    }
    return out;
  }

  it('has no guided input, defaults or contentType problem left in it', () => {
    const all = everyModuleConfig();
    expect(all.length, 'the catalogue went missing — did server/areas move?').toBeGreaterThan(500);

    const failures: string[] = [];
    for (const { where, config: cfg } of all) {
      for (const problem of loader.validateModuleConfig(cfg)) {
        if (problem.kind === 'persona-unknown') continue; // covered below
        failures.push(`${where}: [${problem.kind}] ${problem.detail}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('recommends no persona outside the known-dead backlog', () => {
    const unexpected: string[] = [];
    for (const { where, config: cfg } of everyModuleConfig()) {
      for (const problem of loader.validateModuleConfig(cfg)) {
        if (problem.kind !== 'persona-unknown') continue;
        const id = /contains '([^']+)'/.exec(problem.detail)?.[1] ?? problem.detail;
        if (!KNOWN_DEAD_PERSONA_IDS.has(id)) unexpected.push(`${where} -> ${id}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  it('prints at most the capped number of warnings for the whole catalogue', () => {
    for (const { config: cfg } of everyModuleConfig()) loader.validateModuleConfig(cfg);
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(21);
  });
});
