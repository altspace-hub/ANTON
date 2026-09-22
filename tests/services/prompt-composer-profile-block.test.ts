/**
 * prompt-composer-profile-block.test.ts — the profile's jurisdiction and
 * language reach the prompt (Wave 6 track H, 2026-09-17).
 *
 * Before: the Layer 0 profile block carried the jurisdiction as a decorative
 * "Operating jurisdiction" line and skipped the whole block unless a name,
 * role or organisation was set — a profile that said only "Sweden" never
 * reached the model, and every module asked for the jurisdiction again.
 *
 * No database, no LLM: the composer is driven with an inline module prompt.
 */
import { describe, it, expect } from 'vitest';
import { composeSystemPromptParts, type PromptComposerConfig, type UserProfileData } from '../../server/services/prompt-composer.js';

const base: Omit<PromptComposerConfig, 'userProfile'> = {
  creativity: 'balanced',
  thinking: 'think',
  systemPromptOverride: '## MODULE\nYou assess AML controls.',
  provenanceContract: false,
};

async function profileBlock(userProfile: UserProfileData | null): Promise<string | null> {
  const r = await composeSystemPromptParts({ ...base, userProfile });
  return r.parts.find((p) => p.key === 'layer0_profile')?.text ?? null;
}

describe('Layer 0 profile block — jurisdiction and working language', () => {
  it('carries the jurisdiction, the application sentence and the working language', async () => {
    const text = await profileBlock({ display_name: 'Anna', role_title: 'MLRO', organisation: 'Nordbank', jurisdiction: 'Sweden', output_language: 'sv' });
    expect(text).not.toBeNull();
    const lines = text!.split('\n');
    expect(lines[0]).toBe('## YOUR CONTEXT');
    expect(lines).toContain('You are assisting: Anna , MLRO at Nordbank.');
    expect(lines).toContain('Jurisdiction: Sweden.');
    expect(lines).toContain('Apply the law and terminology of Sweden unless the task names another.');
    expect(lines).toContain('Working language: Swedish.');
    // the application sentence follows the jurisdiction line directly
    expect(lines.indexOf('Apply the law and terminology of Sweden unless the task names another.')).toBe(lines.indexOf('Jurisdiction: Sweden.') + 1);
    // the old decorative wording is gone
    expect(text).not.toContain('Operating jurisdiction');
    expect(text).not.toContain('Preferred output language');
  });

  it('keeps the existing lines in their order around the new ones', async () => {
    const text = await profileBlock({
      name: 'Anna', role: 'MLRO', company: 'Nordbank', industry: 'Banking', jurisdiction: 'Finland',
      experience_level: 'senior', org_size: 'mid-market', output_language: 'fi', focus_areas: '["AML","Sanctions"]',
    });
    const lines = text!.split('\n');
    const order = [
      'You are assisting: Anna , MLRO at Nordbank.',
      'Industry: Banking.',
      'Jurisdiction: Finland.',
      'Apply the law and terminology of Finland unless the task names another.',
      'Experience level: senior.',
      'Organisation size: mid-market.',
      'Working language: Finnish.',
      'Primary focus areas: AML, Sanctions.',
    ].map((l) => lines.indexOf(l));
    for (const idx of order) expect(idx).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(lines[lines.length - 1]).toMatch(/^Tailor your analysis/);
  });

  it('a profile with only a jurisdiction still produces the block (it used to be skipped)', async () => {
    const text = await profileBlock({ jurisdiction: 'Singapore' });
    expect(text).not.toBeNull();
    expect(text).toContain('Jurisdiction: Singapore.');
    expect(text).toContain('Apply the law and terminology of Singapore unless the task names another.');
    expect(text).not.toContain('You are assisting');
  });

  it('a language other than English is enough on its own; a code the map lacks is printed as-is', async () => {
    const sv = await profileBlock({ output_language: 'sv' });
    expect(sv).toContain('Working language: Swedish.');
    expect(sv).not.toContain('Jurisdiction:');

    const xx = await profileBlock({ display_name: 'Anna', output_language: 'xx-YY' });
    expect(xx).toContain('Working language: xx-YY.');
  });

  it('English is the column default — alone it says nothing, beside a name it is stated', async () => {
    expect(await profileBlock({ output_language: 'en' })).toBeNull();
    const withName = await profileBlock({ display_name: 'Anna', output_language: 'en' });
    expect(withName).toContain('Working language: English.');
  });

  it('absent or blank jurisdiction / language produce no lines and no sentence', async () => {
    const text = await profileBlock({ display_name: 'Anna', jurisdiction: '   ', output_language: '' });
    expect(text).not.toBeNull();
    expect(text).not.toContain('Jurisdiction:');
    expect(text).not.toContain('Apply the law and terminology');
    expect(text).not.toContain('Working language:');

    const nulls = await profileBlock({ display_name: 'Anna', jurisdiction: null, output_language: null });
    expect(nulls).not.toContain('Jurisdiction:');
    expect(nulls).not.toContain('Working language:');
  });

  it('negative control: an empty profile injects nothing at all', async () => {
    expect(await profileBlock({})).toBeNull();
    expect(await profileBlock(null)).toBeNull();
  });
});
