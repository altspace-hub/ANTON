/**
 * module-recommendation.test.ts — module suggestions must name modules that exist.
 *
 * Discovery's output prompt asked the model for `moduleId` values and contained NO module
 * list at all. The model was being asked to name things it had never been shown, so every
 * id came from memory of what an ANTON module id probably looks like. `matchedModules` —
 * the output whose entire purpose is turning a conversation into something the user can
 * open — pointed at ids that mostly do not exist, and the user found out by clicking one.
 *
 * The recommender in routes/claude.ts had the other half: it supplied candidates, then
 * returned the answer unchecked.
 *
 * Both halves are needed, and the tests below say why grounding alone is not enough.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  findCandidateModules,
  formatCandidatesForPrompt,
  validateModuleMatches,
} from '../../server/services/module-recommendation.js';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('candidates come from the real catalogue', () => {
  it('returns real modules for a plausible description', async () => {
    const c = await findCandidateModules('we spend days on AML customer due diligence reviews');
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].id).toBeTruthy();
    expect(c[0].label).toBeTruthy();
  });

  it('ranks keyword matches above catalogue order', async () => {
    const c = await findCandidateModules('gap assessment');
    expect(c.slice(0, 10).some((m) => /gap/i.test(m.id) || /gap/i.test(m.label))).toBe(true);
  });

  it('still returns candidates for vague input', async () => {
    // An empty candidate list puts the model straight back to inventing ids, so the
    // fallback matters more than the ranking does.
    const c = await findCandidateModules('help');
    expect(c.length).toBeGreaterThan(0);
  });

  it('caps the list so the prompt stays cheap', async () => {
    const c = await findCandidateModules('compliance risk policy report analysis review');
    expect(c.length).toBeLessThanOrEqual(40);
  });

  it('formats one line per candidate with the id first', async () => {
    const c = await findCandidateModules('risk', 3);
    const text = formatCandidatesForPrompt(c);
    expect(text.split('\n')).toHaveLength(3);
    expect(text.startsWith(`- ${c[0].id}:`)).toBe(true);
  });
});

describe('validation drops ids that do not exist', () => {
  it('rejects an invented id', async () => {
    const r = await validateModuleMatches([{ moduleId: 'totally-made-up-module-xyz' }]);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toEqual(['totally-made-up-module-xyz']);
  });

  it('keeps a real id', async () => {
    const [real] = await findCandidateModules('gap assessment', 1);
    const r = await validateModuleMatches([{ moduleId: real.id }]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].moduleId).toBe(real.id);
  });

  it('overwrites the label from the catalogue instead of trusting the model', async () => {
    // A right id with a wrong label is its own bug: the user clicks something described
    // as one thing and lands on another, which reads as a broken product.
    const [real] = await findCandidateModules('gap assessment', 1);
    const r = await validateModuleMatches([
      { moduleId: real.id, moduleName: 'Something The Model Made Up' },
    ]);
    expect(r.valid[0].moduleName).toBe(real.label);
  });

  it('tolerates case and whitespace', async () => {
    // A model returning "Gap-Assessment" has identified the right module and should not
    // be discarded on presentation.
    const [real] = await findCandidateModules('gap assessment', 1);
    const r = await validateModuleMatches([{ moduleId: `  ${real.id.toUpperCase()}  ` }]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].moduleId).toBe(real.id);
  });

  it('keeps the good and drops the bad from a mixed list', async () => {
    const [real] = await findCandidateModules('risk', 1);
    const r = await validateModuleMatches([
      { moduleId: real.id },
      { moduleId: 'invented-one' },
      { moduleId: 'invented-two' },
    ]);
    expect(r.valid).toHaveLength(1);
    expect(r.rejected).toHaveLength(2);
  });

  it('survives empty, missing and malformed entries', async () => {
    const r = await validateModuleMatches([
      { moduleId: '' },
      { moduleId: undefined as unknown as string },
    ]);
    expect(r.valid).toHaveLength(0);
    // Blank ids are not reported as rejections — there is nothing to report.
    expect(r.rejected).toHaveLength(0);
  });
});

describe('both call sites ground AND validate', () => {
  const DISCOVERY = read('server/services/discovery-engine.ts');
  const CLAUDE = read('server/routes/claude.ts');

  it('Discovery puts the real catalogue in its output prompt', async () => {
    expect(DISCOVERY).toContain('findCandidateModules');
    expect(DISCOVERY).toMatch(/moduleId MUST be one of these exact ids/);
  });

  it('Discovery tells the model to omit rather than invent', async () => {
    // The instruction that makes a grounded list actually bite: without it a model that
    // finds no fit will still produce something.
    expect(DISCOVERY).toMatch(/omit the match rather/);
  });

  it('Discovery validates the parsed matches before saving them', async () => {
    const gen = DISCOVERY.slice(DISCOVERY.indexOf('async function generateOutput'));
    const validateAt = gen.indexOf('validateModuleMatches');
    const insertAt = gen.indexOf('INSERT INTO discovery_outputs');
    expect(validateAt).toBeGreaterThan(-1);
    // Order matters: hallucinated ids must never reach the database, or they outlive
    // the fix and reappear on every later read.
    expect(validateAt).toBeLessThan(insertAt);
  });

  it('the claude.ts recommender validates too, not just grounds', async () => {
    expect(CLAUDE).toContain('validateModuleMatches');
  });

  it('neither surfaces the rejected ids to the user', async () => {
    for (const [name, src] of [['discovery', DISCOVERY], ['claude', CLAUDE]] as const) {
      const warn = src.slice(src.indexOf('rejected'), src.indexOf('rejected') + 400);
      expect(warn, `${name} logs rather than returns rejects`).toMatch(/console\.warn/);
    }
  });
});
