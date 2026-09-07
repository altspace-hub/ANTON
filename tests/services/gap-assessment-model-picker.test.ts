import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * The wizard must use the shared ModelSelector, not its own list.
 *
 * The picker it replaced hardcoded two Claude cards and fetched a bespoke
 * "extraModels" set (Azure deployments plus a literal Mistral/GPT list). That
 * duplicate registry drifted every time the real one moved, and by
 * construction it could never surface the sdk:/codex: subscription engines —
 * which is why the Gap Assessor could not run on the Claude subscription while
 * the rest of ANTON could.
 */
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/pages/GapAssessmentWizard.tsx'),
  'utf8',
);

describe('Gap Assessor model picker', () => {
  it('uses the shared ModelSelector', () => {
    expect(src).toMatch(/import ModelSelector from '@\/components\/shared\/ModelSelector'/);
    expect(src).toMatch(/<ModelSelector/);
  });

  it('keeps no hand-maintained model list of its own', () => {
    // A second registry is the failure mode, whatever it is called.
    expect(src).not.toMatch(/extraModels/);
    expect(src).not.toMatch(/mistral-large-latest'\s*,\s*label/);
    expect(src).not.toMatch(/\/api\/azure-openai\/deployments/);
  });

  it('does not hardcode model names in the picker', () => {
    // Version strings in the picker are how it fell a generation behind.
    const pickerStart = src.indexOf('AI Analysis Depth');
    const pickerEnd = src.indexOf('Evidence Documents', pickerStart);
    const picker = src.slice(pickerStart, pickerEnd);
    expect(picker).not.toMatch(/Sonnet 4\.6/);
    expect(picker).not.toMatch(/Opus 4\.8/);
    expect(picker).not.toMatch(/gpt-5\.4/);
  });

  it('offers the second opinion the same full model range', () => {
    // Any model that can assess must also be able to challenge the assessment.
    const soStart = src.indexOf('runSecondOpinion');
    expect(soStart).toBeGreaterThan(-1);
    expect(src).toMatch(/<ModelSelector value=\{soTier as ModelId\}/);
  });

  it('defaults to a real model id, not a legacy alias', () => {
    // The alias renders as raw text in the shared selector, and only the
    // family match keeps it at full reasoning.
    expect(src).toMatch(/modelTier: 'claude-[a-z0-9.-]+' as string/);
  });
});
