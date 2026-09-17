/**
 * find-jurisdiction-skill.test.ts — a profile jurisdiction maps to the pack
 * that covers it (Wave 6 track H, 2026-09-17).
 *
 * The twelve jurisdiction packs (eleven central-bank disk packs plus the
 * built-in UK/FCA one) were never attached by themselves: nothing turned
 * "Singapore" into jurisdiction-sg-mas. This pins the alias map, built from
 * the packs' own metadata, and the negative controls around it.
 *
 * No database: the disk packs are read from server/skills/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  findJurisdictionSkill,
  getAllSkills,
  invalidateSkillCache,
  isDiskSkillsPreloaded,
  preloadDiskSkills,
} from '../../server/services/skills-manager.js';

describe('findJurisdictionSkill', () => {
  beforeAll(async () => {
    await preloadDiskSkills();
  });

  it('every jurisdiction pack resolves from its own country name', () => {
    const packs = getAllSkills().filter((s) => s.category === 'jurisdiction');
    expect(packs.length).toBe(12);
    const expected: Record<string, string> = {
      'United Arab Emirates': 'jurisdiction-ae-cbuae',
      'Ghana': 'jurisdiction-gh-bog',
      'Hong Kong': 'jurisdiction-hk-hkma',
      'India': 'jurisdiction-in-rbi',
      'Kenya': 'jurisdiction-ke-cbk',
      'Malaysia': 'jurisdiction-my-bnm',
      'Nigeria': 'jurisdiction-ng-cbn',
      'Philippines': 'jurisdiction-ph-bsp',
      'Pakistan': 'jurisdiction-pk-sbp',
      'Saudi Arabia': 'jurisdiction-sa-sama',
      'Singapore': 'jurisdiction-sg-mas',
      'United Kingdom': 'jurisdiction-uk-fca',
    };
    for (const [country, id] of Object.entries(expected)) {
      expect(findJurisdictionSkill(country)?.id, country).toBe(id);
    }
    // every pack is reachable
    const reached = new Set(Object.values(expected));
    for (const p of packs) expect(reached.has(p.id), p.id).toBe(true);
  });

  it('matches ISO-2 / ISO-3 codes and regulator names or acronyms, case-insensitively', () => {
    expect(findJurisdictionSkill('sg')?.id).toBe('jurisdiction-sg-mas');
    expect(findJurisdictionSkill('SGP')?.id).toBe('jurisdiction-sg-mas');
    expect(findJurisdictionSkill('Monetary Authority of Singapore')?.id).toBe('jurisdiction-sg-mas');
    expect(findJurisdictionSkill('mas')?.id).toBe('jurisdiction-sg-mas');
    expect(findJurisdictionSkill('HKMA')?.id).toBe('jurisdiction-hk-hkma');
    expect(findJurisdictionSkill('Bank Negara Malaysia')?.id).toBe('jurisdiction-my-bnm');
    expect(findJurisdictionSkill('UAE')?.id).toBe('jurisdiction-ae-cbuae');
    expect(findJurisdictionSkill('KSA')?.id).toBe('jurisdiction-sa-sama');
    expect(findJurisdictionSkill('uk')?.id).toBe('jurisdiction-uk-fca');
    expect(findJurisdictionSkill('GB')?.id).toBe('jurisdiction-uk-fca');
    expect(findJurisdictionSkill('FCA')?.id).toBe('jurisdiction-uk-fca');
  });

  it('finds the pack inside a longer phrase, folds punctuation and articles, returns the pack name', () => {
    expect(findJurisdictionSkill('Singapore (MAS)')?.id).toBe('jurisdiction-sg-mas');
    expect(findJurisdictionSkill('Hong Kong SAR, China')?.id).toBe('jurisdiction-hk-hkma');
    expect(findJurisdictionSkill('The Philippines')?.id).toBe('jurisdiction-ph-bsp');
    expect(findJurisdictionSkill('  saudi-arabia ')?.id).toBe('jurisdiction-sa-sama');
    const sg = findJurisdictionSkill('Singapore');
    expect(sg).toEqual({ id: 'jurisdiction-sg-mas', name: 'Singapore — Monetary Authority of Singapore (MAS)' });
  });

  it('a two-letter code only matches as the whole value — "in", "my", "no" inside a phrase are words, not countries', () => {
    expect(findJurisdictionSkill('Sweden in the EU')).toBeNull();
    expect(findJurisdictionSkill('my jurisdiction')).toBeNull();
    expect(findJurisdictionSkill('IN')?.id).toBe('jurisdiction-in-rbi');
  });

  it('returns null for jurisdictions no pack covers, and for blank input', () => {
    for (const j of ['Sweden', 'EU', 'Finland', 'Norway', 'Denmark', 'Germany', 'United States', 'Multi-jurisdiction', '', '   ']) {
      expect(findJurisdictionSkill(j), j).toBeNull();
    }
  });

  it('negative control: without the disk preload only the built-in UK pack resolves', async () => {
    invalidateSkillCache();
    expect(isDiskSkillsPreloaded()).toBe(false);
    expect(findJurisdictionSkill('Singapore')).toBeNull();
    expect(findJurisdictionSkill('United Kingdom')?.id).toBe('jurisdiction-uk-fca');
    await preloadDiskSkills();
    expect(findJurisdictionSkill('Singapore')?.id).toBe('jurisdiction-sg-mas');
  });
});
