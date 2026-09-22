/**
 * task-placeholder.test.ts — each module's task box suggests something about
 * that module, not one global AML example (2026-09-22 Work QA).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { taskPlaceholder, examplePlaceholder } from '../../src/lib/task-placeholder';

const LEGACY = 'e.g., Analyze our AML policy against AMLR requirements for a Nordic bank with retail and corporate banking...';
const neutral = (label: string) => `Describe what you need from ${label} — …`;

describe('taskPlaceholder', () => {
  it('a module with a worked example shows the start of that example', () => {
    const p = taskPlaceholder({ example: 'We are a large EU-listed industrials group.', moduleLabel: 'ESG Reporting', neutral, legacy: LEGACY, neutralTranslated: true });
    expect(p).toBe('e.g., We are a large EU-listed industrials group.');
  });

  it('a module without one gets the neutral text naming the module — never the AML example', () => {
    const p = taskPlaceholder({ example: undefined, moduleLabel: 'Green Claims Review', neutral, legacy: LEGACY, neutralTranslated: true });
    expect(p).toContain('Green Claims Review');
    expect(p).not.toMatch(/AML/);
  });

  it('a language without the neutral text keeps its existing translation', () => {
    expect(taskPlaceholder({ example: '', moduleLabel: 'X', neutral, legacy: LEGACY, neutralTranslated: false })).toBe(LEGACY);
  });
});

describe('examplePlaceholder', () => {
  it('cuts a long example at a sentence or word boundary and marks the cut', () => {
    const long = 'We are a large EU-listed industrials group (CSRD wave 1, first full ESRS report for FY2025). We have publicly committed to net zero by 2040 and need the transition plan reviewed against ESRS E1.';
    const p = examplePlaceholder(long);
    expect(p.startsWith('e.g., We are a large EU-listed industrials group')).toBe(true);
    expect(p.endsWith('…')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(150);
    expect(p).not.toMatch(/ \S{1,3}…$/);   // no half-word before the ellipsis
  });
});

describe('wiring', () => {
  it('the module page uses it, and en.json carries the neutral text', () => {
    expect(readFileSync('src/pages/ModulePage.tsx', 'utf8')).toMatch(/\? taskPlaceholder\(\{/);
    const en = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as { module: Record<string, string> };
    expect(en.module.taskPlaceholderFor).toMatch(/\{\{module\}\}/);
  });
});
