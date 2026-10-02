/**
 * demo-hidden-defaults.test.ts — the modules a public demo keeps from
 * visitors when the .env names none (privacy verification 2026-09-26,
 * problems 1 and 2).
 *
 * The privacy notice says the demo does not offer the modules on health, HR,
 * workers' rights, criminal law and investigations, or the credit-risk and
 * CV-writing modules. That held only while the .env listed them, and the
 * recommended list missed some (sar-quality-check, daily-screening-review,
 * sanctions-advisory, employment-rights, microfinance-credit-scoring,
 * credit-score-builder, social-protection-navigator). Now:
 *
 *   - an unset (or blank) DEMO_HIDDEN_AREAS / DEMO_HIDDEN_MODULES means the
 *     built-in lists, which cover all of them; "none" turns a list off; an
 *     explicit list replaces the built-in one, and the server warns about each
 *     recommended id it leaves out;
 *   - /api/config carries the effective lists (hiddenAreas, hiddenModules)
 *     for the web client's catalogue;
 *   - .env.demo.example recommends exactly the built-in lists, and every id
 *     in them is a real area or module.
 *
 * Negative controls: outside demo mode nothing is hidden and nothing is
 * published; the fcp area itself stays open.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_DEMO_HIDDEN_AREAS, DEFAULT_DEMO_HIDDEN_MODULES,
  demoHiddenAreas, demoHiddenModules, demoModuleHidden, demoPublicConfig, demoModeWarnings,
} from '../../server/middleware/demo-mode.js';

const ROOT = join(__dirname, '../..');
const DEMO = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team' };

/** The modules the verification found visitors could still run, with their areas. */
const REPORTED: ReadonlyArray<readonly [module: string, area: string]> = [
  ['sar-quality-check', 'fcp'],
  ['daily-screening-review', 'fcp'],
  ['sanctions-advisory', 'fcp'],
  ['employment-rights', 'consumer-legal'],
  ['microfinance-credit-scoring', 'microfinance'],
  ['credit-score-builder', 'credit-navigator'],
  ['social-protection-navigator', 'government-services'],
];

const hiddenWarning = (w: string[]) => w.filter((x) => x.startsWith('DEMO_HIDDEN_'));

describe('the built-in hidden lists', () => {
  it('apply on a demo when the .env sets neither list', () => {
    expect(demoHiddenAreas(DEMO)).toEqual([...DEFAULT_DEMO_HIDDEN_AREAS]);
    expect(demoHiddenModules(DEMO)).toEqual([...DEFAULT_DEMO_HIDDEN_MODULES]);
    expect(DEFAULT_DEMO_HIDDEN_AREAS).toEqual(['healthcare', 'community-health', 'hr', 'workers-rights']);
  });

  it('hide every module the verification reported, and the earlier recommended ones, with no configuration', () => {
    for (const [mod, area] of REPORTED) expect(demoModuleHidden(mod, area, DEMO), mod).toBe(true);
    for (const [mod, area] of [['credit-risk', 'banking'], ['cv-writer', 'personal-dev'], ['alert-investigation', 'fcp'], ['court-process-demystifier', 'government-services']]) {
      expect(demoModuleHidden(mod, area, DEMO), mod).toBe(true);
    }
    expect(demoModuleHidden('clinical-protocol', 'healthcare', DEMO)).toBe(true);
    expect(demoModuleHidden('wrongful-dismissal', 'workers-rights', DEMO)).toBe(true);
  });

  it('leave the rest of the fcp area, and other modules, open (negative control)', () => {
    expect(demoModuleHidden('gap-analysis', 'fcp', DEMO)).toBe(false);
    expect(demoModuleHidden('business-wide-risk-assessment', 'fcp', DEMO)).toBe(false);
    expect(demoModuleHidden('contract-review', 'legal', DEMO)).toBe(false);
    expect(DEFAULT_DEMO_HIDDEN_AREAS).not.toContain('fcp');
  });

  it('apply for a blank value too, and for one with no id in it', () => {
    for (const blank of ['', '   ', ',', ' , ']) {
      expect(demoHiddenAreas({ ...DEMO, DEMO_HIDDEN_AREAS: blank })).toEqual([...DEFAULT_DEMO_HIDDEN_AREAS]);
      expect(demoHiddenModules({ ...DEMO, DEMO_HIDDEN_MODULES: blank })).toEqual([...DEFAULT_DEMO_HIDDEN_MODULES]);
    }
  });

  it('are turned off by "none", list by list', () => {
    const off = { ...DEMO, DEMO_HIDDEN_AREAS: 'none', DEMO_HIDDEN_MODULES: ' NONE ' };
    expect(demoHiddenAreas(off)).toEqual([]);
    expect(demoHiddenModules(off)).toEqual([]);
    expect(demoModuleHidden('sar-quality-check', 'fcp', off)).toBe(false);
    expect(demoModuleHidden('clinical-protocol', 'healthcare', off)).toBe(false);
    // Only the areas off: the module list still applies.
    const areasOff = { ...DEMO, DEMO_HIDDEN_AREAS: 'none' };
    expect(demoModuleHidden('clinical-protocol', 'healthcare', areasOff)).toBe(false);
    expect(demoModuleHidden('sar-quality-check', 'fcp', areasOff)).toBe(true);
  });

  it('are replaced by an explicit list', () => {
    const env = { ...DEMO, DEMO_HIDDEN_AREAS: 'healthcare', DEMO_HIDDEN_MODULES: 'cv-writer' };
    expect(demoHiddenAreas(env)).toEqual(['healthcare']);
    expect(demoHiddenModules(env)).toEqual(['cv-writer']);
    expect(demoModuleHidden('sar-quality-check', 'fcp', env)).toBe(false);
  });

  it('hide nothing outside demo mode, set or not (negative control)', () => {
    for (const env of [{}, { DEPLOYMENT_MODE: 'team' }, { DEPLOYMENT_MODE: 'team', DEMO_HIDDEN_AREAS: 'healthcare', DEMO_HIDDEN_MODULES: 'cv-writer' }]) {
      expect(demoHiddenAreas(env)).toEqual([]);
      expect(demoHiddenModules(env)).toEqual([]);
      for (const [mod, area] of REPORTED) expect(demoModuleHidden(mod, area, env)).toBe(false);
    }
  });

  it('name only areas and modules that exist', () => {
    const areasDir = join(ROOT, 'server/areas');
    for (const area of DEFAULT_DEMO_HIDDEN_AREAS) expect(existsSync(join(areasDir, area, 'area.json')), area).toBe(true);
    const moduleIds = new Set(readdirSync(areasDir).flatMap((area) => {
      const dir = join(areasDir, area, 'modules');
      return existsSync(dir) ? readdirSync(dir) : [];
    }));
    // A few modules (the talent-* HR ones) have only a legacy prompt in server/prompts.
    const legacyPrompts = new Set(readdirSync(join(ROOT, 'server/prompts')).map((f) => f.replace(/\.md$/, '')));
    for (const mod of DEFAULT_DEMO_HIDDEN_MODULES) expect(moduleIds.has(mod) || legacyPrompts.has(mod), mod).toBe(true);
    for (const [mod, area] of REPORTED) expect(existsSync(join(areasDir, area, 'modules', mod)), `${area}/${mod}`).toBe(true);
  });
});

describe('.env.demo.example', () => {
  const lines = readFileSync(join(ROOT, '.env.demo.example'), 'utf8').split(/\r?\n/);
  const value = (name: string): string[] => {
    const line = lines.find((l) => l.startsWith(`${name}=`));
    expect(line, name).toBeDefined();
    return line!.slice(name.length + 1).split(',').map((s) => s.trim()).filter(Boolean);
  };

  it('recommends exactly the built-in lists', () => {
    expect(value('DEMO_HIDDEN_AREAS').sort()).toEqual([...DEFAULT_DEMO_HIDDEN_AREAS].sort());
    expect(value('DEMO_HIDDEN_MODULES').sort()).toEqual([...DEFAULT_DEMO_HIDDEN_MODULES].sort());
  });

  it('raises no hidden-list warning when used as written', () => {
    const env = { ...DEMO, DEMO_HIDDEN_AREAS: value('DEMO_HIDDEN_AREAS').join(','), DEMO_HIDDEN_MODULES: value('DEMO_HIDDEN_MODULES').join(',') };
    expect(hiddenWarning(demoModeWarnings(env))).toEqual([]);
  });
});

describe('the start-up warnings', () => {
  it('say nothing about the lists while they are unset (the built-in lists apply)', () => {
    expect(hiddenWarning(demoModeWarnings(DEMO))).toEqual([]);
  });

  it('warn when both lists are "none"', () => {
    const w = hiddenWarning(demoModeWarnings({ ...DEMO, DEMO_HIDDEN_AREAS: 'none', DEMO_HIDDEN_MODULES: 'none' }));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^DEMO_HIDDEN_AREAS and DEMO_HIDDEN_MODULES are both "none"/);
  });

  it('name each recommended id an explicit list leaves out', () => {
    const w = hiddenWarning(demoModeWarnings({
      ...DEMO,
      DEMO_HIDDEN_AREAS: DEFAULT_DEMO_HIDDEN_AREAS.filter((a) => a !== 'hr').join(','),
      DEMO_HIDDEN_MODULES: DEFAULT_DEMO_HIDDEN_MODULES.filter((m) => m !== 'sar-quality-check' && m !== 'cv-writer').join(',') + ',extra-module',
    }));
    expect(w).toEqual([
      'DEMO_HIDDEN_AREAS leaves out hr: the privacy notice says the demo does not offer them.',
      'DEMO_HIDDEN_MODULES leaves out cv-writer, sar-quality-check: the privacy notice says the demo does not offer them.',
    ]);
  });

  it('say nothing outside demo mode (negative control)', () => {
    expect(demoModeWarnings({ DEPLOYMENT_MODE: 'team', DEMO_HIDDEN_AREAS: 'none', DEMO_HIDDEN_MODULES: 'none' })).toEqual([]);
  });
});

describe('/api/config hiddenAreas and hiddenModules', () => {
  it('carry the effective lists: the built-in ones when unset', () => {
    expect(demoPublicConfig(DEMO)).toMatchObject({
      hiddenAreas: [...DEFAULT_DEMO_HIDDEN_AREAS],
      hiddenModules: [...DEFAULT_DEMO_HIDDEN_MODULES],
    });
  });

  it('carry an explicit list as the server reads it, and empty ones for "none"', () => {
    expect(demoPublicConfig({ ...DEMO, DEMO_HIDDEN_AREAS: ' HR , hr', DEMO_HIDDEN_MODULES: 'Cv-Writer' }))
      .toMatchObject({ hiddenAreas: ['hr'], hiddenModules: ['cv-writer'] });
    expect(demoPublicConfig({ ...DEMO, DEMO_HIDDEN_AREAS: 'none', DEMO_HIDDEN_MODULES: 'none' }))
      .toMatchObject({ hiddenAreas: [], hiddenModules: [] });
  });

  it('are not published outside demo mode (negative control)', () => {
    expect(demoPublicConfig({ DEPLOYMENT_MODE: 'team', DEMO_HIDDEN_AREAS: 'healthcare' })).toEqual({ demoMode: false });
  });
});
