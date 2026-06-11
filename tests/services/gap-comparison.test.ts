/**
 * gap-comparison.test.ts — attributed re-assessment deltas (Wave 1.7,
 * CORE_EXPERIENCE_REVIEW 2026-06) + the deterministic "Since Last Assessment"
 * board section. Pure functions over snapshots — no DB needed.
 */
import { describe, it, expect } from 'vitest';
import { compareIterations, buildSinceLastAssessmentSection } from '../../server/services/gap-comparison.js';

type Snap = Parameters<typeof compareIterations>[0][number];

function snap(partial: Partial<Snap> & { articleId: string; numericScore: number }): Snap {
  return {
    framework: 'amlr-2024',
    score: 'amber',
    priority: 'high',
    ...partial,
  } as Snap;
}

describe('compareIterations — attribution (Wave 1.7)', () => {
  it('movement WITH a changeReason is attributed as evidence-driven (reassessment)', () => {
    const before = [snap({ articleId: 'Art.1', numericScore: 30 })];
    const after = [snap({ articleId: 'Art.1', numericScore: 60, changeReason: 'New TM policy v2 uploaded covering alert handling' })];
    const cmp = compareIterations(before, after);
    expect(cmp.totalImproved).toBe(1);
    expect(cmp.improved[0].attributed).toBe(true);
    expect(cmp.improved[0].attributionSource).toBe('reassessment');
    expect(cmp.improved[0].changeReason).toContain('TM policy v2');
    expect(cmp.attribution).toEqual({ evidenceDriven: 1, unexplained: 0, carriedForward: 0 });
  });

  it('movement WITHOUT any reason is flagged unexplained', () => {
    const before = [snap({ articleId: 'Art.2', numericScore: 70 })];
    const after = [snap({ articleId: 'Art.2', numericScore: 40 })];
    const cmp = compareIterations(before, after);
    expect(cmp.totalWorsened).toBe(1);
    expect(cmp.worsened[0].attributed).toBe(false);
    expect(cmp.worsened[0].attributionSource).toBeNull();
    expect(cmp.attribution.unexplained).toBe(1);
  });

  it('assessor-override movement is attributed with source=override', () => {
    const before = [snap({ articleId: 'Art.3', numericScore: 20 })];
    const after = [snap({ articleId: 'Art.3', numericScore: 55, overrideKind: 'facts', overrideReason: 'On-site walkthrough confirmed the control operates' })];
    const cmp = compareIterations(before, after);
    expect(cmp.improved[0].attributed).toBe(true);
    expect(cmp.improved[0].attributionSource).toBe('override');
    expect(cmp.improved[0].changeReason).toContain('walkthrough');
  });

  it('changeReason wins over overrideReason when both exist', () => {
    const before = [snap({ articleId: 'Art.4', numericScore: 10 })];
    const after = [snap({ articleId: 'Art.4', numericScore: 35, changeReason: 'reassessed', overrideKind: 'manual', overrideReason: 'manual fix' })];
    const cmp = compareIterations(before, after);
    expect(cmp.improved[0].attributionSource).toBe('reassessment');
    expect(cmp.improved[0].changeReason).toBe('reassessed');
  });

  it('carried-forward unchanged articles are counted', () => {
    const before = [snap({ articleId: 'Art.5', numericScore: 50 }), snap({ articleId: 'Art.6', numericScore: 50 })];
    const after = [
      snap({ articleId: 'Art.5', numericScore: 50, carriedForward: true }),
      snap({ articleId: 'Art.6', numericScore: 50 }), // unchanged but re-scored
    ];
    const cmp = compareIterations(before, after);
    expect(cmp.totalUnchanged).toBe(2);
    expect(cmp.attribution.carriedForward).toBe(1);
    expect(cmp.unchanged.find(u => u.articleId === 'Art.5')?.carriedForward).toBe(true);
    expect(cmp.unchanged.find(u => u.articleId === 'Art.6')?.carriedForward).toBe(false);
  });

  it('blank/whitespace changeReason does not count as attribution', () => {
    const before = [snap({ articleId: 'Art.7', numericScore: 30 })];
    const after = [snap({ articleId: 'Art.7', numericScore: 45, changeReason: '   ' })];
    const cmp = compareIterations(before, after);
    expect(cmp.improved[0].attributed).toBe(false);
    expect(cmp.attribution.unexplained).toBe(1);
  });
});

describe('buildSinceLastAssessmentSection — deterministic board section', () => {
  const before = [
    snap({ articleId: 'Art.1', numericScore: 30 }),
    snap({ articleId: 'Art.2', numericScore: 70 }),
    snap({ articleId: 'Art.3', numericScore: 50 }),
  ];
  const after = [
    snap({ articleId: 'Art.1', numericScore: 60, articleTitle: 'CDD', changeReason: 'New CDD procedure evidenced in doc-2' }),
    snap({ articleId: 'Art.2', numericScore: 40 }),
    snap({ articleId: 'Art.3', numericScore: 50, carriedForward: true }),
  ];

  it('contains the counts, deltas, reasons and the unexplained marker', () => {
    const md = buildSinceLastAssessmentSection(compareIterations(before, after));
    expect(md).toContain('### Since Last Assessment');
    expect(md).toContain('computed deterministically');
    expect(md).toContain('| 1 | 1 | 1 |');                       // improved/regressed/unchanged
    expect(md).toContain('New CDD procedure evidenced in doc-2'); // the stated reason
    expect(md).toContain('*unexplained — review*');               // the unattributed regression
    expect(md).toContain('▲ improved');
    expect(md).toContain('▼ regressed');
    expect(md).toContain('30 → 60');
    expect(md).toContain('1 article(s) were carried forward unchanged');
    expect(md).toContain('1 change(s) evidence-driven');
  });

  it('says so when nothing moved', () => {
    const same = [snap({ articleId: 'Art.1', numericScore: 50 })];
    const md = buildSinceLastAssessmentSection(compareIterations(same, same.map(s => ({ ...s }))));
    expect(md).toContain('No article scores moved since the last assessment.');
  });

  it('escapes pipes in reasons so the markdown table survives', () => {
    const b = [snap({ articleId: 'Art.9', numericScore: 10 })];
    const a = [snap({ articleId: 'Art.9', numericScore: 30, changeReason: 'reason | with pipe' })];
    const md = buildSinceLastAssessmentSection(compareIterations(b, a));
    expect(md).toContain('reason \\| with pipe');
  });
});
