/**
 * mission-notification.test.ts — Wave-2 2A.2 real delivery.
 *
 * 'notification' tasks used to be LLM prose that *claimed* delivery. These
 * tests lock the pure resolution layer: channel selection honours
 * module_config first, degrades unimplemented preferences to in_app with an
 * explicit note (never silently), and the bundle/synthesis pickers select
 * real content tasks only.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveNotificationChannel,
  composeDeliveryBundle,
  pickFinalSynthesis,
  hasCompletedNotificationTask,
} from '../../../server/services/missions/mission-notification.js';
import type { MissionTask, TaskStatus, TaskType } from '../../../server/services/missions/types.js';

function task(partial: Partial<MissionTask> & { id: string }): MissionTask {
  return {
    mission_id: 'm_test',
    parent_task_id: null,
    title: partial.id,
    description: null,
    task_type: 'llm' as TaskType,
    status: 'completed' as TaskStatus,
    priority: 0,
    module_id: null,
    area_id: null,
    module_config: {},
    provider: null,
    model: null,
    model_tier: null,
    estimated_tokens: null,
    actual_tokens_consumed: 0,
    estimated_duration_seconds: null,
    actual_duration_seconds: null,
    output_summary: null,
    output_full: 'output',
    quality_score: null,
    confidence_score: null,
    atoms_produced: 0,
    retry_count: 0,
    max_retries: 3,
    last_error: null,
    sort_order: 0,
    created_at: '2026-06-10T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...partial,
  };
}

describe('resolveNotificationChannel', () => {
  it('honours an explicit implemented channel from module_config', () => {
    const target = resolveNotificationChannel(
      { channel: 'webhook', destination: { url: 'https://hooks.example.com/x' } },
      { review_channel: 'in_app' },
    );
    expect(target.channel).toBe('webhook');
    expect(target.destination).toEqual({ url: 'https://hooks.example.com/x' });
    expect(target.note).toBeNull();
  });

  it('degrades an unimplemented explicit channel to in_app WITH a note (no silent claims)', () => {
    const target = resolveNotificationChannel({ channel: 'email' }, undefined);
    expect(target.channel).toBe('in_app');
    expect(target.note).toMatch(/email.*not implemented/i);
  });

  it('maps an in_app preference straight through', () => {
    const target = resolveNotificationChannel(null, { review_channel: 'in_app' });
    expect(target.channel).toBe('in_app');
    expect(target.note).toBeNull();
  });

  it('degrades unimplemented preferences (email/push) to in_app with a note', () => {
    const target = resolveNotificationChannel(null, { review_channel: 'push' });
    expect(target.channel).toBe('in_app');
    expect(target.note).toMatch(/push.*not implemented/i);
  });

  it('defaults to in_app with no config and no preferences', () => {
    const target = resolveNotificationChannel(undefined, undefined);
    expect(target.channel).toBe('in_app');
    expect(target.note).toBeNull();
  });
});

describe('composeDeliveryBundle', () => {
  it('bundles completed content tasks in graph order, skipping plumbing types', () => {
    const bundle = composeDeliveryBundle([
      task({ id: 't1', title: 'Research', sort_order: 1, output_full: 'research output' }),
      task({ id: 't2', title: 'Gate', sort_order: 2, task_type: 'checkpoint' as TaskType, output_full: 'noise' }),
      task({ id: 't3', title: 'Synthesis', sort_order: 3, output_full: 'final synthesis' }),
      task({ id: 't4', title: 'Queued', sort_order: 4, status: 'queued' as TaskStatus }),
    ]);
    expect(bundle).toContain('## Research');
    expect(bundle).toContain('## Synthesis');
    expect(bundle).not.toContain('Gate');
    expect(bundle).not.toContain('Queued');
    expect(bundle.indexOf('Research')).toBeLessThan(bundle.indexOf('Synthesis'));
  });

  it('caps the bundle size and says so', () => {
    const big = 'x'.repeat(40_000);
    const bundle = composeDeliveryBundle([
      task({ id: 't1', title: 'A', sort_order: 1, output_full: big }),
      task({ id: 't2', title: 'B', sort_order: 2, output_full: big }),
    ], 35_000);
    expect(bundle.length).toBeLessThan(40_000);
    expect(bundle).toContain('[bundle truncated');
  });

  it('returns empty string when nothing is deliverable', () => {
    expect(composeDeliveryBundle([task({ id: 't1', status: 'queued' as TaskStatus })])).toBe('');
  });
});

describe('pickFinalSynthesis', () => {
  it('picks the LAST completed content task with output', () => {
    const synth = pickFinalSynthesis([
      task({ id: 't1', sort_order: 1, output_full: 'early' }),
      task({ id: 't3', sort_order: 3, task_type: 'checkpoint' as TaskType }),
      task({ id: 't2', sort_order: 2, output_full: 'the synthesis' }),
    ]);
    expect(synth?.id).toBe('t2');
  });

  it('returns null when no content task completed', () => {
    expect(pickFinalSynthesis([task({ id: 't1', task_type: 'checkpoint' as TaskType })])).toBeNull();
    expect(pickFinalSynthesis([task({ id: 't1', output_full: '   ' })])).toBeNull();
  });
});

describe('hasCompletedNotificationTask (auto-delivery dedupe)', () => {
  it('true only for a COMPLETED notification task', () => {
    expect(hasCompletedNotificationTask([
      task({ id: 't1', task_type: 'notification' as TaskType, status: 'completed' as TaskStatus }),
    ])).toBe(true);
    expect(hasCompletedNotificationTask([
      task({ id: 't1', task_type: 'notification' as TaskType, status: 'queued' as TaskStatus }),
    ])).toBe(false);
    expect(hasCompletedNotificationTask([task({ id: 't1' })])).toBe(false);
  });
});
