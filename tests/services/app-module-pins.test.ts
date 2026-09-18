import { describe, it, expect } from 'vitest';
import {
  PIN_COUNT,
  LEGACY_PINS,
  LEGACY_CHIPS,
  ORG_TYPE_PINS,
  ORG_TYPE_CHIPS,
  resolvePinnedModuleIds,
  resolveIntentChips,
  intentCategoryModuleIds,
} from '../../server/services/app-module-pins';
import { MODULES } from '../../src/lib/constants';

/**
 * 2026-09-18 (Wave 6, track B): the companion app's home screen pinned four
 * financial-crime modules and offered four compliance-consultant intent chips
 * to every user of every ANTON instance, keyed on nothing at all. These pin
 * the replacement ladder — and, crucially, that its last rung is still the old
 * behaviour, so an org with no signal at all sees no change.
 */
const catalogue = new Set<string>(MODULES.map((m) => m.id as string));
const isKnown = (id: string): boolean => catalogue.has(id);

describe('app-module-pins — every id ships', () => {
  it('every LEGACY_PIN still resolves to a real module', () => {
    expect(LEGACY_PINS.filter((id) => !isKnown(id))).toEqual([]);
  });

  it('every org-type starter pin resolves to a real module', () => {
    const dangling: string[] = [];
    for (const [orgType, ids] of Object.entries(ORG_TYPE_PINS)) {
      for (const id of ids) if (!isKnown(id)) dangling.push(`${orgType} -> ${id}`);
    }
    expect(dangling).toEqual([]);
  });

  it('every mapped org type offers a full tile row and a full chip row', () => {
    for (const [orgType, ids] of Object.entries(ORG_TYPE_PINS)) {
      expect(ids.length, orgType).toBeGreaterThanOrEqual(PIN_COUNT);
    }
    for (const [orgType, chips] of Object.entries(ORG_TYPE_CHIPS)) {
      expect(chips.length, orgType).toBeGreaterThanOrEqual(PIN_COUNT);
    }
    // A type with pins but no chips (or the reverse) would half-personalise
    // the screen — the two maps are meant to move together.
    expect(Object.keys(ORG_TYPE_PINS).sort()).toEqual(Object.keys(ORG_TYPE_CHIPS).sort());
  });

  it('the org types that are deliberately unmapped stay unmapped', () => {
    // company / sports_club / other fall through to LEGACY_PINS rather than to
    // a set invented for them. If one of these gains a mapping it should be a
    // decision, not a drive-by.
    for (const orgType of ['company', 'sports_club', 'other']) {
      expect(ORG_TYPE_PINS[orgType], orgType).toBeUndefined();
    }
  });
});

describe('resolvePinnedModuleIds', () => {
  it('falls all the way back to the four it always pinned', () => {
    // The load-bearing guarantee: no signal ⇒ no change for that deployment.
    expect(resolvePinnedModuleIds({}, isKnown)).toEqual([...LEGACY_PINS]);
    expect(resolvePinnedModuleIds({ orgType: 'other' }, isKnown)).toEqual([...LEGACY_PINS]);
  });

  it('a consulting org keeps the financial-crime four, by mapping not by accident', () => {
    expect(resolvePinnedModuleIds({ orgType: 'consulting' }, isKnown)).toEqual([...LEGACY_PINS]);
    expect(resolvePinnedModuleIds({ orgType: 'consulting_firm' }, isKnown)).toEqual([...LEGACY_PINS]);
  });

  it('an NGO or school sees its own population, not a compliance workflow', () => {
    expect(resolvePinnedModuleIds({ orgType: 'ngo' }, isKnown)).toEqual([...ORG_TYPE_PINS.ngo]);
    expect(resolvePinnedModuleIds({ orgType: 'school' }, isKnown)).toEqual([...ORG_TYPE_PINS.school]);
    for (const id of LEGACY_PINS) {
      expect(resolvePinnedModuleIds({ orgType: 'ngo' }, isKnown)).not.toContain(id);
    }
  });

  it("what this person actually opens outranks everything else", () => {
    const pins = resolvePinnedModuleIds({
      personal: ['budget-builder', 'symptom-assessment'],
      configured: ['gap-analysis'],
      orgPopular: ['loan-comparison'],
      orgType: 'consulting',
    }, isKnown);
    expect(pins.slice(0, 2)).toEqual(['budget-builder', 'symptom-assessment']);
    expect(pins).toHaveLength(PIN_COUNT);
  });

  it('the org configuration outranks the org-type guess', () => {
    const pins = resolvePinnedModuleIds({
      configured: ['crop-planning-advisor', 'pest-disease-guide'],
      orgType: 'ngo',
    }, isKnown);
    expect(pins.slice(0, 2)).toEqual(['crop-planning-advisor', 'pest-disease-guide']);
  });

  it('tops a short signal up to a full row rather than showing two tiles', () => {
    const pins = resolvePinnedModuleIds({ personal: ['budget-builder'], orgType: 'school' }, isKnown);
    expect(pins).toHaveLength(PIN_COUNT);
    expect(pins[0]).toBe('budget-builder');
  });

  it('never repeats a module across rungs', () => {
    const pins = resolvePinnedModuleIds({
      personal: ['gap-analysis'],
      configured: ['gap-analysis', 'sanctions-advisory'],
      orgPopular: ['sanctions-advisory'],
      orgType: 'consulting',
    }, isKnown);
    expect(new Set(pins).size).toBe(pins.length);
  });

  it('drops an id the catalogue cannot serve rather than shipping a dead tile', () => {
    const pins = resolvePinnedModuleIds({
      personal: ['a-module-that-was-retired', 'budget-builder'],
      orgType: 'ngo',
    }, isKnown);
    expect(pins).not.toContain('a-module-that-was-retired');
    expect(pins[0]).toBe('budget-builder');
    expect(pins).toHaveLength(PIN_COUNT);
  });

  it('survives junk in a signal without throwing', () => {
    const junk = ['', '   ', null, undefined, 42] as unknown as string[];
    expect(resolvePinnedModuleIds({ personal: junk }, isKnown)).toEqual([...LEGACY_PINS]);
  });
});

describe('resolveIntentChips', () => {
  it("shows the org admin's own intent categories first", () => {
    const chips = resolveIntentChips(['Report a repair', 'Ask about my tenancy'], 'community');
    expect(chips.slice(0, 2)).toEqual(['Report a repair', 'Ask about my tenancy']);
    expect(chips).toHaveLength(4);
  });

  it('falls back to the org type, then to the chips that always shipped', () => {
    expect(resolveIntentChips([], 'school')).toEqual([...ORG_TYPE_CHIPS.school]);
    expect(resolveIntentChips([], null)).toEqual([...LEGACY_CHIPS]);
    expect(resolveIntentChips([], 'other')).toEqual([...LEGACY_CHIPS]);
  });

  it('normalises and caps a category name so it cannot deform the chip row', () => {
    const long = 'x'.repeat(200);
    const [first] = resolveIntentChips([`  Ask   about\n  housing  `, long], 'ngo');
    expect(first).toBe('Ask about housing');
    expect(resolveIntentChips([long], 'ngo')[0].length).toBeLessThanOrEqual(40);
  });

  it('does not show the same chip twice', () => {
    const chips = resolveIntentChips(['Draft something', 'draft something'], 'consulting');
    expect(new Set(chips.map((c) => c.toLowerCase())).size).toBe(chips.length);
  });
});

describe('intentCategoryModuleIds', () => {
  it('puts the default module first, then the allowlist', () => {
    expect(intentCategoryModuleIds({
      default_module_id: 'budget-builder',
      allowed_modules: ['loan-comparison', 'budget-builder'],
    })).toEqual(['budget-builder', 'loan-comparison']);
  });

  it('accepts allowed_modules as parsed JSONB or as text', () => {
    expect(intentCategoryModuleIds({ allowed_modules: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(intentCategoryModuleIds({ allowed_modules: '["a","b"]' })).toEqual(['a', 'b']);
  });

  it('yields nothing for an empty, malformed or absent value', () => {
    expect(intentCategoryModuleIds({})).toEqual([]);
    expect(intentCategoryModuleIds({ default_module_id: null, allowed_modules: null })).toEqual([]);
    expect(intentCategoryModuleIds({ allowed_modules: 'not json' })).toEqual([]);
    expect(intentCategoryModuleIds({ allowed_modules: { nope: true } })).toEqual([]);
  });
});
