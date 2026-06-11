/**
 * task-agent-mission-compiler.test.ts — Wave 5.1 (Core Experience Review
 * 2026-06): the Task Agent → Missions compile bridge.
 *
 * compileTaskToMission / summarizeLinkedMission / buildMissionDeliverable
 * are PURE — no DB, no LLM — so the full mapping (incl. honest fallbacks)
 * is tested exhaustively here.
 */
import { describe, it, expect } from 'vitest';
import {
  compileTaskToMission,
  summarizeLinkedMission,
  buildMissionDeliverable,
  CONTEXT_DOC_CHAR_BUDGET,
  CONTEXT_TOTAL_CHAR_CAP,
  type CompileTaskInput,
  type ApproachExecutionStep,
} from '../../server/services/task-agent-mission-compiler.js';
import { missionTaskToStepRecord } from '../../server/types/step-record.js';

function baseInput(overrides?: Partial<CompileTaskInput>): CompileTaskInput {
  return {
    task: { id: 'task-1', title: 'AMLR gap analysis for Nordbank', description: 'Assess Nordbank against AMLR 2024/1624.', priority: 'normal' },
    approach: {
      id: 'app-amlr-readiness',
      name: 'AMLR Readiness Assessment',
      outcome: 'Board-ready AMLR gap assessment',
      execution_steps: [
        { step: 1, name: 'Define scope', description: 'Select article groups' },
        { step: 2, name: 'Run AI assessment', description: 'Assess each article group' },
        { step: 3, name: 'Export deliverables', description: 'Produce board summary' },
      ],
    },
    intakeAnswers: { entity: 'Nordbank (credit institution)', jurisdiction: 'Sweden' },
    attachedFiles: [],
    groundingText: null,
    ...overrides,
  };
}

describe('compileTaskToMission — prose steps (the default path)', () => {
  it('compiles 3 prose steps into 3 llm tasks with 2 inter-step checkpoints, linearly chained', () => {
    const { graph, notes } = compileTaskToMission(baseInput());
    const types = graph.tasks.map(t => t.task_type);
    expect(types).toEqual(['llm', 'checkpoint', 'llm', 'checkpoint', 'llm']);

    // Linear chain: every node after the first depends on exactly the previous one.
    for (let i = 1; i < graph.tasks.length; i++) {
      expect(graph.tasks[i].depends_on).toEqual([graph.tasks[i - 1].local_id]);
    }
    expect(graph.tasks[0].depends_on).toBeUndefined();

    // sort_order strictly increasing
    const orders = graph.tasks.map(t => t.sort_order!);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(orders).size).toBe(orders.length);

    // No warnings for a clean prose compile
    expect(notes.filter(n => n.level === 'warning')).toEqual([]);
  });

  it('llm tasks carry the step prompt (step name + task title + deliverable instruction)', () => {
    const { graph } = compileTaskToMission(baseInput());
    const firstLlm = graph.tasks[0];
    expect(firstLlm.prompt).toContain('Step 1: Define scope');
    expect(firstLlm.prompt).toContain('AMLR gap analysis for Nordbank');
    expect(firstLlm.prompt).toContain('complete deliverable');
    expect(firstLlm.estimated_tokens).toBeGreaterThan(0);
  });

  it('checkpoints reference the previous step and explain the mid-execution-conversation limitation honestly', () => {
    const { graph } = compileTaskToMission(baseInput());
    const gate = graph.tasks[1];
    expect(gate.task_type).toBe('checkpoint');
    expect(gate.checkpoint_message).toContain('Step 1');
    expect(gate.checkpoint_message).toContain('Step 2');
    expect(gate.description).toContain('Mid-execution clarifying conversation is not available');
  });

  it('interStepCheckpoints:false produces a pure llm chain', () => {
    const { graph } = compileTaskToMission(baseInput({ options: { interStepCheckpoints: false } }));
    expect(graph.tasks.map(t => t.task_type)).toEqual(['llm', 'llm', 'llm']);
  });

  it('sorts steps by step number even when the JSON is out of order', () => {
    const input = baseInput();
    input.approach.execution_steps = [
      { step: 2, name: 'Second' },
      { step: 1, name: 'First' },
    ];
    const { graph } = compileTaskToMission(input);
    expect(graph.tasks[0].title).toBe('First');
  });
});

describe('compileTaskToMission — mission fields', () => {
  it('maps title/objective/success criteria and locks autonomy to check_in', () => {
    const { mission } = compileTaskToMission(baseInput());
    expect(mission.title).toBe('AMLR gap analysis for Nordbank');
    expect(mission.objective).toBe('Assess Nordbank against AMLR 2024/1624.');
    expect(mission.success_criteria).toBe('Board-ready AMLR gap assessment');
    expect(mission.autonomy_level).toBe('check_in');
  });

  it('derives success criteria from the approach name when outcome is missing', () => {
    const input = baseInput();
    input.approach.outcome = undefined;
    const { mission } = compileTaskToMission(input);
    expect(mission.success_criteria).toContain('AMLR Readiness Assessment');
  });

  it('maps Task Agent priorities (urgent→critical, unknown→normal)', () => {
    expect(compileTaskToMission(baseInput({ task: { ...baseInput().task, priority: 'urgent' } })).mission.priority).toBe('critical');
    expect(compileTaskToMission(baseInput({ task: { ...baseInput().task, priority: 'high' } })).mission.priority).toBe('high');
    expect(compileTaskToMission(baseInput({ task: { ...baseInput().task, priority: 'weird' } })).mission.priority).toBe('normal');
    expect(compileTaskToMission(baseInput({ task: { ...baseInput().task, priority: undefined } })).mission.priority).toBe('normal');
  });
});

describe('compileTaskToMission — context assembly', () => {
  it('carries intake answers and grounding text into mission.context', () => {
    const { mission } = compileTaskToMission(baseInput({ groundingText: '## FRAMEWORK GROUNDING\nAMLR Article 16 text…' }));
    expect(mission.context).toContain('Nordbank (credit institution)');
    expect(mission.context).toContain('jurisdiction: Sweden');
    expect(mission.context).toContain('FRAMEWORK GROUNDING');
  });

  it('includes attached document excerpts and warns when the doc budget truncates them', () => {
    const bigDoc = 'A'.repeat(CONTEXT_DOC_CHAR_BUDGET * 2);
    const { mission, notes } = compileTaskToMission(baseInput({
      attachedFiles: [{ name: 'policy.pdf', text: bigDoc }],
    }));
    expect(mission.context).toContain('DOCUMENT: policy.pdf');
    expect(mission.context).toContain('truncated');
    const warning = notes.find(n => n.level === 'warning' && n.message.includes('context budget'));
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('classic per-step Task Agent path');
  });

  it('small docs pass through whole without a truncation warning', () => {
    const { mission, notes } = compileTaskToMission(baseInput({
      attachedFiles: [{ name: 'note.txt', text: 'Short policy excerpt.' }],
    }));
    expect(mission.context).toContain('Short policy excerpt.');
    expect(notes.filter(n => n.level === 'warning')).toEqual([]);
  });

  it('enforces the hard total context cap with an explicit note', () => {
    const { mission, notes } = compileTaskToMission(baseInput({
      groundingText: 'G'.repeat(CONTEXT_TOTAL_CHAR_CAP * 2),
    }));
    expect(mission.context.length).toBeLessThanOrEqual(CONTEXT_TOTAL_CHAR_CAP + 100);
    expect(notes.some(n => n.message.includes('hard cap'))).toBe(true);
  });
});

describe('compileTaskToMission — declared actions (additive action_type)', () => {
  const actionStep: ApproachExecutionStep = {
    step: 2,
    name: 'Fetch sanctions list',
    description: 'Pull the consolidated list',
    action_type: 'api_call',
    action_config: { url: 'https://example.org/sanctions.json', method: 'GET' },
  };

  it('a validly-declared api_call compiles to a real action task with its config', () => {
    const input = baseInput();
    input.approach.execution_steps = [
      { step: 1, name: 'Define scope' },
      actionStep,
    ];
    const { graph, notes } = compileTaskToMission(input);
    const action = graph.tasks.find(t => t.task_type === 'api_call');
    expect(action).toBeDefined();
    expect(action!.module_config).toMatchObject({ url: 'https://example.org/sanctions.json', method: 'GET' });
    expect(action!.prompt).toBeUndefined();
    expect(notes.some(n => n.level === 'info' && n.message.includes('api_call'))).toBe(true);
  });

  it('an action with invalid config falls back to llm WITH a warning — never silently degraded', () => {
    const input = baseInput();
    input.approach.execution_steps = [
      { step: 1, name: 'Run browser flow', action_type: 'browser', action_config: { service_id: 'svc' } }, // missing workflow_id
    ];
    const { graph, notes } = compileTaskToMission(input);
    expect(graph.tasks[0].task_type).toBe('llm');
    const warning = notes.find(n => n.level === 'warning' && n.step === 1);
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('will NOT be performed automatically');
  });

  it('an unknown action_type falls back to llm with a warning naming the valid types', () => {
    const input = baseInput();
    input.approach.execution_steps = [
      { step: 1, name: 'Do magic', action_type: 'teleport', action_config: {} },
    ];
    const { graph, notes } = compileTaskToMission(input);
    expect(graph.tasks[0].task_type).toBe('llm');
    expect(notes[0].level).toBe('warning');
    expect(notes[0].message).toContain('api_call');
  });

  it('never fabricates actions for plain prose steps', () => {
    const { graph } = compileTaskToMission(baseInput());
    expect(graph.tasks.every(t => t.task_type === 'llm' || t.task_type === 'checkpoint')).toBe(true);
  });
});

describe('compileTaskToMission — degenerate approaches', () => {
  it('an approach with no steps compiles to a single llm task + warning', () => {
    const input = baseInput();
    input.approach.execution_steps = [];
    const { graph, notes } = compileTaskToMission(input);
    expect(graph.tasks).toHaveLength(1);
    expect(graph.tasks[0].task_type).toBe('llm');
    expect(notes.some(n => n.level === 'warning' && n.message.includes('no execution steps'))).toBe(true);
  });

  it('a single-step approach has no checkpoints (nothing between steps)', () => {
    const input = baseInput();
    input.approach.execution_steps = [{ step: 1, name: 'Only step' }];
    const { graph } = compileTaskToMission(input);
    expect(graph.tasks.map(t => t.task_type)).toEqual(['llm']);
  });
});

// ── Status round-trip mapping ───────────────────────────────────────────────

type SummaryTask = { title: string; status: string };

describe('summarizeLinkedMission', () => {
  const mission = { id: 'm_1', status: 'active', title: 'Test mission' };

  it('computes counts and progress (skipped counts as resolved)', () => {
    const tasks: SummaryTask[] = [
      { title: 'a', status: 'completed' },
      { title: 'b', status: 'skipped' },
      { title: 'c', status: 'active' },
      { title: 'd', status: 'queued' },
    ];
    const s = summarizeLinkedMission(mission, tasks as never);
    expect(s.total_tasks).toBe(4);
    expect(s.completed_tasks).toBe(2);
    expect(s.progress_pct).toBe(50);
    expect(s.current_task_title).toBe('c');
    expect(s.awaiting_human).toBe(false);
  });

  it('prefers the active task as current, falls back to paused', () => {
    const tasks: SummaryTask[] = [
      { title: 'paused-one', status: 'paused' },
      { title: 'queued-one', status: 'queued' },
    ];
    const s = summarizeLinkedMission(mission, tasks as never);
    expect(s.current_task_title).toBe('paused-one');
    expect(s.awaiting_human).toBe(true); // paused task = waiting on a human
  });

  it('flags awaiting_human when the mission is in review', () => {
    const s = summarizeLinkedMission({ ...mission, status: 'review' }, [] as never);
    expect(s.awaiting_human).toBe(true);
  });

  it('handles zero tasks without dividing by zero', () => {
    const s = summarizeLinkedMission(mission, [] as never);
    expect(s.progress_pct).toBe(0);
    expect(s.current_task_title).toBeNull();
  });

  it('counts failed tasks', () => {
    const tasks: SummaryTask[] = [{ title: 'x', status: 'failed' }];
    expect(summarizeLinkedMission(mission, tasks as never).failed_tasks).toBe(1);
  });
});

// ── Deliverable assembly ────────────────────────────────────────────────────

function missionTask(over: Partial<Parameters<typeof buildMissionDeliverable>[0][number]>) {
  return {
    id: 't_x', title: 'Task', description: null, task_type: 'llm', status: 'completed',
    output_full: 'Output text', quality_score: null, retry_count: 0, completed_at: '2026-06-11T00:00:00.000Z',
    sort_order: 1,
    ...over,
  };
}

describe('buildMissionDeliverable', () => {
  it('includes only completed deliverable-producing tasks with non-empty output, in sort order', () => {
    const tasks = [
      missionTask({ id: 't2', title: 'Second', sort_order: 2, output_full: 'Second output' }),
      missionTask({ id: 't1', title: 'First', sort_order: 1, output_full: 'First output' }),
      missionTask({ id: 'gate', title: 'Gate', task_type: 'checkpoint', sort_order: 3 }),
      missionTask({ id: 'cond', title: 'Cond', task_type: 'conditional', sort_order: 4 }),
      missionTask({ id: 'fail', title: 'Failed', status: 'failed', sort_order: 5 }),
      missionTask({ id: 'empty', title: 'Empty', output_full: '   ', sort_order: 6 }),
    ];
    const { deliverableText, stepRecords } = buildMissionDeliverable(tasks);
    expect(stepRecords.map(r => r.name)).toEqual(['First', 'Second']);
    expect(deliverableText).toContain('## Step 1: First');
    expect(deliverableText).toContain('## Step 2: Second');
    expect(deliverableText).not.toContain('Gate');
  });

  it('action task outputs (api_call etc.) count as deliverables', () => {
    const tasks = [missionTask({ id: 'a1', title: 'Fetch', task_type: 'api_call', output_full: '{"status":200}' })];
    const { stepRecords } = buildMissionDeliverable(tasks);
    expect(stepRecords).toHaveLength(1);
    expect(stepRecords[0].mission_task_id).toBe('a1');
  });

  it('step records carry the shared shape with source=mission and quality data', () => {
    const tasks = [missionTask({ id: 't9', quality_score: 8.2, retry_count: 1 })];
    const { stepRecords } = buildMissionDeliverable(tasks);
    expect(stepRecords[0]).toMatchObject({
      step: 0, name: 'Task', output: 'Output text',
      quality_score: 8.2, retry_count: 1,
      source: 'mission', mission_task_id: 't9',
    });
  });

  it('returns an empty deliverable for a mission with only control tasks', () => {
    const tasks = [missionTask({ id: 'g', task_type: 'checkpoint' })];
    const { deliverableText, stepRecords } = buildMissionDeliverable(tasks);
    expect(deliverableText).toBe('');
    expect(stepRecords).toEqual([]);
  });
});

describe('missionTaskToStepRecord', () => {
  it('omits retry_count when zero and preserves completion time', () => {
    const rec = missionTaskToStepRecord({
      id: 't1', title: 'T', description: 'Desc', task_type: 'llm', status: 'completed',
      output_full: 'Out', quality_score: null, retry_count: 0,
      completed_at: '2026-06-11T10:00:00.000Z', sort_order: 1,
    }, 3);
    expect(rec.retry_count).toBeUndefined();
    expect(rec.at).toBe('2026-06-11T10:00:00.000Z');
    expect(rec.step).toBe(3);
    expect(rec.description).toBe('Desc');
  });
});
