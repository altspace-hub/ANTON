/**
 * school-safety-foundation-missing.test.ts
 *
 * The degradation half of the contract: if the safeguarding prompt file cannot be
 * read, a child's lesson must still run.
 *
 * Split into its own file because `vi.mock` is file-scoped. The sibling suite proves
 * the loader really returns '' against a real missing path on disk; this one proves
 * that an empty layer leaves buildSchoolPrompt whole rather than throwing or emitting
 * a malformed prompt. Together they cover the path end to end without renaming a
 * repository file at runtime, which would leave the repo damaged if a run died.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/services/school-safety-foundation.js', () => ({
  SAFETY_FOUNDATION_PATH: '/nonexistent/school-safety-foundation.md',
  getSchoolSafetyFoundation: () => Promise.resolve(''),
}));

import {
  buildSchoolPrompt,
  type SchoolPromptConfig,
} from '../../../server/services/school-prompt-builder.js';

const TIERS: SchoolPromptConfig['educationTier'][] = ['T1', 'T2', 'T3', 'T4', 'T5'];

describe('buildSchoolPrompt with the safety layer unreadable', () => {
  it.each(TIERS)('still builds a usable %s lesson prompt', async (tier) => {
    const prompt = await buildSchoolPrompt({
      educationTier: tier,
      subjectId: 'mathematics',
      teacherPersonaId: 'alma',
      assistanceLevel: 'L2',
      taskType: 'homework',
    });

    // Degraded, not broken: no safety layer, but every other layer intact.
    expect(prompt).not.toContain('Safeguarding Response Layer — Highest Priority');
    expect(prompt).toContain('# ANTON School Mode — System Foundation');
    expect(prompt).toContain('## Active Session Parameters');
    expect(prompt.length).toBeGreaterThan(1000);
  });

  it('does not open the prompt with a bare front-matter marker', async () => {
    const prompt = await buildSchoolPrompt({
      educationTier: 'T3',
      subjectId: 'mathematics',
      teacherPersonaId: 'alma',
      assistanceLevel: 'L2',
      taskType: 'homework',
    });
    expect(prompt.startsWith('---')).toBe(false);
    expect(prompt.startsWith('# ANTON School Mode — System Foundation')).toBe(true);
  });

  it('keeps the T1 child-mode block first when the safety layer is gone', async () => {
    const prompt = await buildSchoolPrompt({
      educationTier: 'T1',
      subjectId: 'mathematics',
      teacherPersonaId: 'alma',
      assistanceLevel: 'L2',
      taskType: 'homework',
    });
    expect(prompt.startsWith('## T1 CHILD MODE')).toBe(true);
  });
});
