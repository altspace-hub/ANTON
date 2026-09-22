/**
 * task-agent-plan.test.ts — the plan the model writes for a task is the plan
 * that runs.
 *
 * Until 2026-09-08 select-approach stored only the approach id; the model's
 * tailored proposal ("AMLR CDD Gap Analysis — Articles 20–40") was discarded
 * and execution ran the seeded template's steps — "Open Gap Assessor wizard",
 * "Export deliverables" — as if they were deliverables.
 */
import { describe, it, expect } from 'vitest';
import { resolveExecutionSteps, MODEL_PLAN_APPROACH_ID } from '../../server/routes/task-agent.js';
import { TaskSelectApproachSchema } from '../../server/lib/schemas.js';

const TEMPLATE = JSON.stringify([
  { step: 1, name: 'Select AMLR framework', description: 'Open Gap Assessor wizard and select AMLR 2024/1624' },
  { step: 2, name: 'Export deliverables', description: 'Download board summary' },
]);

describe('resolveExecutionSteps', () => {
  it('runs the plan the model authored when one was stored with the choice', () => {
    const task = { chosen_approach_config: JSON.stringify({ execution_steps: [
      { step: 1, name: 'Article-by-article CDD gap matrix for AMLR Arts 20–40', module_id: 'amlr-gap-analysis' },
      { step: 2, name: 'Remediation memo for the MLRO' },
    ] }) };
    const steps = resolveExecutionSteps(task, TEMPLATE);
    expect(steps.map((s) => s.name)).toEqual(['Article-by-article CDD gap matrix for AMLR Arts 20–40', 'Remediation memo for the MLRO']);
    expect(steps[0].module_id).toBe('amlr-gap-analysis');
  });

  it('falls back to the template when no plan was stored, or an empty one', () => {
    expect(resolveExecutionSteps({ chosen_approach_config: null }, TEMPLATE).map((s) => s.name)).toEqual(['Select AMLR framework', 'Export deliverables']);
    expect(resolveExecutionSteps({ chosen_approach_config: JSON.stringify({ execution_steps: [] }) }, TEMPLATE)).toHaveLength(2);
    expect(resolveExecutionSteps({ chosen_approach_config: '{not json' }, TEMPLATE)).toHaveLength(2);
  });

  it('returns nothing rather than throwing when neither exists', () => {
    expect(resolveExecutionSteps({ chosen_approach_config: null }, null)).toEqual([]);
  });
});

describe('TaskSelectApproachSchema — the plan travels with the choice', () => {
  it('accepts a plan of deliverable steps with optional module ids', () => {
    const parsed = TaskSelectApproachSchema.parse({
      approach_id: MODEL_PLAN_APPROACH_ID,
      execution_steps: [
        { step: 1, name: 'Redline memo on the indemnity clause', module_id: 'contract-review' },
        { step: 2, name: 'Negotiation position paper', description: 'From the redline and the client brief' },
      ],
    });
    expect(parsed.execution_steps).toHaveLength(2);
    expect(parsed.config).toEqual({});
  });

  it('rejects a plan that is not a list of named steps', () => {
    expect(() => TaskSelectApproachSchema.parse({ approach_id: 'x', execution_steps: [{ step: 1 }] })).toThrow();
    expect(() => TaskSelectApproachSchema.parse({ approach_id: 'x', execution_steps: 'do the thing' })).toThrow();
  });
});
