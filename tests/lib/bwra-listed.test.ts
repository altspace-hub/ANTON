/**
 * bwra-listed.test.ts — the business-wide risk assessment is a module people
 * can find and run, and it only claims what a single run does.
 *
 * 2026-09-22 investigation: the AMLR Art. 10 BWRA module existed on disk since
 * April but was never listed; its prompt described orchestrating seven atlas-*
 * modules and an "executor" that persisted Atlas state — none of which exists
 * (the Atlas makes no model calls); it scored inherent risk as "E × T × V"
 * against the Atlas rule max(E, T, V); and the Atlas banner targeted four
 * module ids that do not exist, so it never rendered.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODULES, AREAS } from '../../src/lib/constants';
import { ATLAS_MODULES } from '../../src/components/risk-atlas/AtlasMigrationBanner';

const DIR = 'server/areas/fcp/modules/business-wide-risk-assessment';
const prompt = readFileSync(`${DIR}/system-prompt.md`, 'utf8');
const config = JSON.parse(readFileSync(`${DIR}/module.json`, 'utf8')) as {
  guidedInputs: Array<{ id: string; options?: Array<{ label: string }> }>;
};

describe('listing', () => {
  it('is in the catalogue and in the FCP area', () => {
    expect(MODULES.some((m) => m.id === 'business-wide-risk-assessment')).toBe(true);
    const fcp = AREAS.find((a) => a.id === 'fcp');
    expect(fcp?.moduleIds).toContain('business-wide-risk-assessment');
  });

  it('the Atlas banner targets only modules that exist', () => {
    const ids = new Set(MODULES.map((m) => m.id));
    for (const id of ATLAS_MODULES) expect(ids.has(id)).toBe(true);
  });
});

describe('the prompt claims only what one run does', () => {
  it('no orchestration of atlas-* modules, no executor, no Atlas writes', () => {
    expect(prompt).not.toMatch(/atlas-\*|orchestrator|The executor|pack_applied|create a new one with the right pack|atlas_id/);
  });

  it('uses the Atlas scoring rules — inherent is the highest of E, T, V, not a product', () => {
    expect(prompt).not.toMatch(/E × T × V/);
    expect(prompt).toMatch(/inherent = the highest of exposure, threat and vulnerability/);
    expect(prompt).toMatch(/− 2 \(Strong\), − 1 \(Adequate\), − 0 \(Weak or Absent\), never below 1/);
    expect(prompt).toMatch(/1-2 within, 3 boundary, 4 outside, 5 unacceptable/);
  });

  it('shows the arithmetic and checks the summary against the tables', () => {
    // A live Quick run before this line existed scored inherent 5 + Adequate as 3
    // and said "two of five outside appetite" over a table showing four.
    expect(prompt).toMatch(/Write the subtraction in the table for every path/);
    expect(prompt).toMatch(/Check before you finish\.\*\* Recompute every residual/);
  });

  it('a supplied board pack is used as given, not re-scored', () => {
    expect(prompt).toMatch(/take its threat paths, scores, control ratings and appetite positions as given — do not re-score them/);
    const ids = config.guidedInputs.map((g) => g.id);
    expect(ids).toContain('atlas_board_pack');
    expect(ids).not.toContain('atlas_id');
  });

  it('points to modules that exist', () => {
    expect(prompt).not.toMatch(/amlr-gap-analysis|sanctions-compliance-assessment|kyc-cdd-framework-review|transaction-monitoring-assessment/);
  });

  it('estate agents are obliged entities now, not "from 2027"', () => {
    const labels = config.guidedInputs.flatMap((g) => g.options ?? []).map((o) => o.label);
    expect(labels).toContain('Real Estate Agent');
    expect(labels.join(' ')).not.toMatch(/obliged from 2027/);
  });
});
