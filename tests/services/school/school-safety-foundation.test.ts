/**
 * school-safety-foundation.test.ts
 *
 * server/prompts/school-safety-foundation.md existed for its whole life with zero
 * references — a written safeguarding foundation that never reached a model. These
 * tests assert the text is actually IN a built prompt, at the right position, for
 * every tier. Asserting that the import exists would have passed the entire time
 * the feature was dead.
 *
 * The marker strings below were checked against a build of the prompt before the
 * wiring existed: none of them appeared anywhere in it, so none of these assertions
 * can be satisfied by some other layer that happens to use similar words.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  getSchoolSafetyFoundation,
  SAFETY_FOUNDATION_PATH,
} from '../../../server/services/school-safety-foundation.js';
import {
  buildSchoolPrompt,
  type SchoolPromptConfig,
} from '../../../server/services/school-prompt-builder.js';

/** Phrases unique to school-safety-foundation.md — absent from every other layer. */
const MARKERS = [
  'Safeguarding Response Layer — Highest Priority',
  'Childline UK: 0800 1111',
  'died by suicide',
  'Safe Messaging — Mental Health and Crisis Topics',
  'Age-Appropriate Content Standards',
];

const TIERS: SchoolPromptConfig['educationTier'][] = ['T1', 'T2', 'T3', 'T4', 'T5'];

function configFor(tier: SchoolPromptConfig['educationTier']): SchoolPromptConfig {
  return {
    educationTier: tier,
    subjectId: 'mathematics',
    teacherPersonaId: 'alma',
    assistanceLevel: 'L2',
    taskType: 'homework',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('safety foundation source file', () => {
  it('still carries the safeguarding protocol it is loaded for', async () => {
    const raw = await fs.readFile(SAFETY_FOUNDATION_PATH, 'utf-8');
    for (const marker of MARKERS) {
      expect(raw, `source file lost marker: ${marker}`).toContain(marker);
    }
    expect(path.basename(SAFETY_FOUNDATION_PATH)).toBe('school-safety-foundation.md');
  });
});

describe('getSchoolSafetyFoundation', () => {
  it('returns the foundation text behind a precedence banner', async () => {
    const text = await getSchoolSafetyFoundation();
    expect(text).toContain('SAFETY PRECEDENCE');
    for (const marker of MARKERS) {
      expect(text).toContain(marker);
    }
    // The banner has to lead, or naming the precedence achieves nothing.
    expect(text.indexOf('SAFETY PRECEDENCE'))
      .toBeLessThan(text.indexOf('Safeguarding Response Layer — Highest Priority'));
  });

  it('reads from disk once — repeat calls return the identical cached promise', () => {
    const a = getSchoolSafetyFoundation();
    const b = getSchoolSafetyFoundation();
    expect(a).toBe(b);
  });

  it('degrades to empty and logs when the file is missing — never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = path.join(path.dirname(SAFETY_FOUNDATION_PATH), 'no-such-safety-file.md');

    await expect(getSchoolSafetyFoundation(missing)).resolves.toBe('');

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('school/safety');
    expect(logged).toContain('WITHOUT the safety foundation');
  });

  it('logs the missing layer once, not once per lesson request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = path.join(path.dirname(SAFETY_FOUNDATION_PATH), 'no-such-safety-file-2.md');

    await getSchoolSafetyFoundation(missing);
    await getSchoolSafetyFoundation(missing);
    await getSchoolSafetyFoundation(missing);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('buildSchoolPrompt — safety foundation is in the prompt', () => {
  it.each(TIERS)('reaches tier %s, not only T1', async (tier) => {
    const prompt = await buildSchoolPrompt(configFor(tier));
    for (const marker of MARKERS) {
      expect(prompt, `tier ${tier} prompt missing: ${marker}`).toContain(marker);
    }
  });

  it('leads the T1 prompt — above the child-mode tone block, not below it', async () => {
    const prompt = await buildSchoolPrompt(configFor('T1'));

    const safetyAt = prompt.indexOf('Safeguarding Response Layer — Highest Priority');
    const childModeAt = prompt.indexOf('## T1 CHILD MODE');
    const layer1At = prompt.indexOf('# ANTON School Mode — System Foundation');

    // Guard the sentinels: `-1 < n` is true, so an absent marker would otherwise
    // make the ordering assertions below pass while proving nothing.
    expect(safetyAt).toBeGreaterThanOrEqual(0);
    expect(childModeAt).toBeGreaterThanOrEqual(0);
    expect(layer1At).toBeGreaterThanOrEqual(0);

    expect(safetyAt).toBeLessThan(childModeAt);
    expect(safetyAt).toBeLessThan(layer1At);

    // The child-mode block is what the safety layer has to outrank: it asks for a
    // closing emoji on every response and treats violence as a non-topic.
    expect(prompt).toContain('Add ONE relevant emoji at the end of each response');
    expect(prompt.indexOf('SAFETY PRECEDENCE')).toBeLessThan(childModeAt);
  });

  it('leads a non-T1 prompt too, where no child-mode block exists at all', async () => {
    const prompt = await buildSchoolPrompt(configFor('T3'));

    expect(prompt).not.toContain('## T1 CHILD MODE');

    const safetyAt = prompt.indexOf('Safeguarding Response Layer — Highest Priority');
    const layer1At = prompt.indexOf('# ANTON School Mode — System Foundation');
    expect(safetyAt).toBeGreaterThanOrEqual(0);
    expect(layer1At).toBeGreaterThanOrEqual(0);
    expect(safetyAt).toBeLessThan(layer1At);
  });

  it('separates the safety layer from what follows instead of running into it', async () => {
    const prompt = await buildSchoolPrompt(configFor('T1'));
    const childModeAt = prompt.indexOf('## T1 CHILD MODE');
    expect(childModeAt).toBeGreaterThanOrEqual(0);
    expect(prompt.slice(childModeAt - 7, childModeAt)).toBe('\n\n---\n\n');

    // A prompt must not open with a bare '---', which reads as YAML front-matter.
    expect(prompt.startsWith('---')).toBe(false);
  });
});
