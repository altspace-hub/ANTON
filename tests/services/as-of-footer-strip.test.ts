/**
 * as-of-footer-strip.test.ts — Wave 4B (2026-09-18).
 *
 * The "As of:" footer is metadata for maintainers, not instruction for the model. Its
 * verb phrase is an imperative — "verify dates against primary sources before relying on
 * them" — and an imperative inside a system prompt reads as an instruction, one the model
 * cannot carry out unless web search happens to be on.
 *
 * This was already happening: `loadArea` read area-context.md verbatim and the composer
 * pushed it as layer 3, so every area context dated in September 2026 had been shipping
 * its footer to the model. Extending the regime to 42 module prompts would have made that
 * 42 more files, so the footer is now stripped at load, before it can enter the cache.
 *
 * The guard tests (tests/lib/*-as-of.test.ts) read the files from disk, not through the
 * loader, so the footer is still required on disk and still checked there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AS_OF_LINE,
  asOfFooter,
  hasAsOfFooter,
  stripMaintainerFooter,
  extractAsOfMonth,
} from '../../server/lib/as-of-footer.js';
import { getModuleSystemPrompt, getAreaContext, getAreaContextAsOf } from '../../server/services/module-loader.js';
import { composeSystemPrompt } from '../../server/services/prompt-composer.js';

const FOOTER = asOfFooter('2026-09');
const repoRoot = path.resolve(__dirname, '..', '..');

describe('stripMaintainerFooter', () => {
  it('removes the canonical footer and the blank line before it', () => {
    const out = stripMaintainerFooter(`# Title\n\nBody text.\n\n${FOOTER}\n`);
    expect(out).toBe('# Title\n\nBody text.');
  });

  it('removes a "_Sources checked …_" note sitting above the footer', () => {
    const src = `Body text.\n\n_Sources checked 17 September 2026: skatteverket.se._\n\n${FOOTER}\n`;
    expect(stripMaintainerFooter(src)).toBe('Body text.');
  });

  it('leaves text that carries no footer exactly as it was', () => {
    const src = '# Title\n\nBody text with a date, 25 May 2018.\n';
    expect(stripMaintainerFooter(src)).toBe(src);
  });

  it('leaves a footer that is NOT the final line in place', () => {
    // If a file is malformed the guard should fail loudly, not be silently patched up
    // here. Stripping only the final line keeps those two responsibilities separate.
    const src = `Body.\n\n${FOOTER}\n\nTrailing paragraph that should not be here.`;
    expect(stripMaintainerFooter(src)).toBe(src);
  });

  it('does not mistake a near-miss line for the footer', () => {
    const src = '_As of: 2026-09 — verify dates._';
    expect(stripMaintainerFooter(src)).toBe(src);
  });

  it('is idempotent', () => {
    const once = stripMaintainerFooter(`Body.\n\n${FOOTER}\n`);
    expect(stripMaintainerFooter(once)).toBe(once);
  });
});

describe('the footer is on disk but never reaches the model', () => {
  const stampedModule = 'gap-analysis';
  const stampedModuleFile = path.join(
    repoRoot, 'server', 'areas', 'fcp', 'modules', stampedModule, 'system-prompt.md',
  );
  const guardedAreaFile = path.join(repoRoot, 'server', 'areas', 'fcp', 'area-context.md');

  it('the fixtures this test depends on really are stamped on disk', () => {
    // Without this the three assertions below would pass on unstamped files, which is
    // exactly the "passed for the wrong reason" failure mode.
    expect(hasAsOfFooter(fs.readFileSync(stampedModuleFile, 'utf-8'))).toBe(true);
    expect(hasAsOfFooter(fs.readFileSync(guardedAreaFile, 'utf-8'))).toBe(true);
  });

  it('getModuleSystemPrompt returns the prompt without the footer', async () => {
    const prompt = await getModuleSystemPrompt(stampedModule);
    expect(prompt).toBeTruthy();
    expect(prompt ?? '').not.toMatch(AS_OF_LINE);
    // …and the body survived the strip.
    expect((prompt ?? '').length).toBeGreaterThan(500);
  });

  it('getAreaContext returns the context without the footer', async () => {
    const context = await getAreaContext('fcp');
    expect(context).toBeTruthy();
    expect(context).not.toMatch(AS_OF_LINE);
    expect(context.length).toBeGreaterThan(500);
  });

  it('the composed system prompt carries no maintainer metadata', async () => {
    const composed = await composeSystemPrompt({
      creativity: 'balanced',
      thinking: 'think',
      moduleId: stampedModule,
      areaId: 'fcp',
    });
    expect(composed).not.toMatch(AS_OF_LINE);
    expect(composed).not.toMatch(/^_Sources checked/m);
    // The module prompt and area context did reach it — otherwise "no footer" would be
    // true because nothing was injected at all. One distinctive line from each.
    expect(composed).toContain('# AMLR Gap Analysis — System Prompt');
    expect(composed).toContain('# FCP Area Context — Financial Crime Prevention');
  });
});

/**
 * The footer is stripped, but its DATE is kept and restated as a plain fact.
 *
 * Stripping alone left the model with no idea how old its domain context was, while the
 * provenance-and-limits contract (see provenanceContractText) still requires every
 * deliverable to say what was not checked. The composer therefore appends one declarative
 * sentence built from the stripped month — a fact, not an imperative the model cannot obey.
 */
describe('the review date survives the strip as a fact', () => {
  it('extractAsOfMonth reads the month, and only from the canonical footer', () => {
    expect(extractAsOfMonth(`body\n\n${asOfFooter('2026-09')}`)).toBe('2026-09');
    expect(extractAsOfMonth('body with no footer')).toBeNull();
    // A near-miss is not the footer, so it must not yield a date.
    expect(extractAsOfMonth('_As of 2026-09: verify dates against primary sources._')).toBeNull();
  });

  it('a dated area states when it was reviewed, in the declarative', async () => {
    const asOf = await getAreaContextAsOf('fcp');
    expect(asOf, 'fcp is one of the dated areas').toMatch(/^\d{4}-\d{2}$/);

    const prompt = await composeSystemPrompt({
      areaId: 'fcp', creativity: 'balanced', thinking: 'think',
    });
    expect(prompt).toContain(`This domain context was last reviewed in ${asOf}.`);
    // The imperative must not come back with it.
    expect(prompt).not.toMatch(AS_OF_LINE);
    expect(prompt).not.toContain('verify dates against primary sources');
  });

  it('an undated area says nothing rather than guessing', async () => {
    const asOf = await getAreaContextAsOf('sales');
    expect(asOf, 'sales carries no canonical footer').toBeNull();

    const prompt = await composeSystemPrompt({
      areaId: 'sales', creativity: 'balanced', thinking: 'think',
    });
    expect(prompt).not.toContain('This domain context was last reviewed in');
  });
});
