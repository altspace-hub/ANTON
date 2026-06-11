/**
 * task-quality-gate.test.ts — Task Agent quality-gate hardening
 * (Core Experience Review 2026-06, item 1.8).
 *
 * Covers: full-output coverage via stratified sampling, strict-JSON rubric
 * parsing (with tolerance for fences/prose and hard failure on garbage), and
 * the critique-fed retry guidance.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSamples,
  buildGatePrompt,
  parseGateResponse,
  scoreWithGate,
  buildRetryGuidance,
  SAMPLE_CHUNK_CHARS,
  type GateResult,
} from '../../server/services/task-quality-gate.js';

describe('task-quality-gate — full-output sampling', () => {
  it('passes short outputs whole, labeled FULL OUTPUT', () => {
    const samples = buildSamples('short deliverable text');
    expect(samples).toHaveLength(1);
    expect(samples[0].label).toContain('FULL OUTPUT');
    expect(samples[0].text).toBe('short deliverable text');
  });

  it('stratifies long outputs into labeled head + middle + tail chunks', () => {
    const out = 'H'.repeat(SAMPLE_CHUNK_CHARS) + 'M'.repeat(SAMPLE_CHUNK_CHARS * 4) + 'T'.repeat(SAMPLE_CHUNK_CHARS);
    const samples = buildSamples(out);
    expect(samples).toHaveLength(3);
    expect(samples[0].label).toContain('BEGINNING');
    expect(samples[1].label).toContain('MIDDLE');
    expect(samples[2].label).toContain('END');
    expect(samples[0].text).toBe('H'.repeat(SAMPLE_CHUNK_CHARS));
    expect(samples[2].text).toBe('T'.repeat(SAMPLE_CHUNK_CHARS));
    // The middle sample must come from the middle of the document
    expect(samples[1].text).toContain('M');
    expect(samples[1].text).not.toContain('H');
    expect(samples[1].text).not.toContain('T');
  });

  it('prompt for a long output includes all three samples + the sampling notice (not the whole doc)', () => {
    const out = 'A'.repeat(20000) + 'UNIQUE_TAIL_MARKER';
    const prompt = buildGatePrompt(out, 'AMLR gap analysis', 'Draft findings');
    expect(prompt).toContain('SAMPLE 1/3');
    expect(prompt).toContain('SAMPLE 3/3');
    expect(prompt).toContain('UNIQUE_TAIL_MARKER'); // tail IS covered now
    expect(prompt).toContain('three labeled samples');
    expect(prompt.length).toBeLessThan(out.length); // sampled, not full
    expect(prompt).toContain('completeness');
    expect(prompt).toContain('grounding');
    expect(prompt).toContain('structure');
    expect(prompt).toContain('actionability');
  });
});

describe('task-quality-gate — strict JSON parsing', () => {
  it('parses a strict JSON rubric response', () => {
    const r = parseGateResponse(
      '{"completeness": 8, "grounding": 6.5, "structure": 9, "actionability": 7, "overall": 7.5, "critique": "Cites AMLR articles without numbers; recommendations lack owners."}'
    );
    expect(r).not.toBeNull();
    expect(r!.overall).toBe(7.5);
    expect(r!.dimensions).toEqual({ completeness: 8, grounding: 6.5, structure: 9, actionability: 7 });
    expect(r!.critique).toContain('lack owners');
  });

  it('tolerates markdown code fences and surrounding prose', () => {
    const r = parseGateResponse(
      'Here is my assessment:\n```json\n{"completeness": 9, "grounding": 9, "structure": 9, "actionability": 9, "overall": 9, "critique": "Strong."}\n```\nThanks!'
    );
    expect(r).not.toBeNull();
    expect(r!.overall).toBe(9);
  });

  it('clamps out-of-range scores into 0-10 and coerces numeric strings', () => {
    const r = parseGateResponse(
      '{"completeness": 14, "grounding": -2, "structure": "8", "actionability": 7, "overall": "11", "critique": ""}'
    );
    expect(r).not.toBeNull();
    expect(r!.overall).toBe(10);
    expect(r!.dimensions.completeness).toBe(10);
    expect(r!.dimensions.grounding).toBe(0);
    expect(r!.dimensions.structure).toBe(8);
  });

  it('defaults missing dimensions to the overall score', () => {
    const r = parseGateResponse('{"overall": 6, "critique": "thin"}');
    expect(r).not.toBeNull();
    expect(r!.dimensions).toEqual({ completeness: 6, grounding: 6, structure: 6, actionability: 6 });
  });

  it('returns null for garbage, prose-only, and missing-overall responses', () => {
    expect(parseGateResponse('')).toBeNull();
    expect(parseGateResponse('The output looks great, about an 8 I think')).toBeNull();
    expect(parseGateResponse('{"completeness": 8}')).toBeNull(); // no overall
    expect(parseGateResponse('{not json at all')).toBeNull();
  });
});

describe('task-quality-gate — orchestration', () => {
  it('scoreWithGate pipes the prompt through the injected llm and parses the result', async () => {
    let seenPrompt = '';
    const r = await scoreWithGate(async (prompt) => {
      seenPrompt = prompt;
      return '{"completeness": 7, "grounding": 7, "structure": 7, "actionability": 7, "overall": 7, "critique": "Needs depth."}';
    }, 'the deliverable', 'AMLR readiness', 'Step 1');
    expect(r).not.toBeNull();
    expect(r!.overall).toBe(7);
    expect(seenPrompt).toContain('the deliverable');
    expect(seenPrompt).toContain('AMLR readiness');
  });

  it('returns null (never throws) when the llm call fails', async () => {
    const r = await scoreWithGate(async () => { throw new Error('provider down'); }, 'x', 't', 's');
    expect(r).toBeNull();
  });
});

describe('task-quality-gate — critique fed into retries', () => {
  const gate: GateResult = {
    overall: 6.5,
    dimensions: { completeness: 5, grounding: 6, structure: 8.5, actionability: 7 },
    critique: 'The CDD section stops mid-sentence and no article numbers are cited.',
  };

  it('buildRetryGuidance carries the reviewer critique verbatim', () => {
    const g = buildRetryGuidance(gate);
    expect(g).toContain('6.5/10');
    expect(g).toContain('The CDD section stops mid-sentence and no article numbers are cited.');
  });

  it('names the weakest rubric dimensions, weakest first', () => {
    const g = buildRetryGuidance(gate);
    expect(g).toContain('completeness (5.0/10)');
    expect(g).toContain('grounding (6.0/10)');
    expect(g).toContain('actionability (7.0/10)');
    expect(g).not.toContain('structure'); // ≥ 8 — not a weakness
    expect(g.indexOf('completeness')).toBeLessThan(g.indexOf('grounding'));
  });

  it('omits the weak-dimensions line when all dimensions are strong', () => {
    const g = buildRetryGuidance({
      overall: 7.9,
      dimensions: { completeness: 8, grounding: 8, structure: 8, actionability: 8 },
      critique: 'Close — tighten the executive summary.',
    });
    expect(g).not.toContain('Weakest dimensions');
    expect(g).toContain('tighten the executive summary');
  });
});
