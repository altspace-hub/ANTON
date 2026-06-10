/**
 * mission-runner.test.ts — Wave-2 2A.1 runner gating predicate.
 *
 * The background runner must NEVER auto-advance anything but 'active'
 * missions ('briefed' awaits human plan approval), must skip missions
 * already in flight, and must respect the global concurrency cap. These are
 * the safety invariants the tick relies on; they're pure so no DB is needed.
 */
import { describe, it, expect } from 'vitest';
import { selectRunnableMissions, RUNNER_MAX_CONCURRENT_MISSIONS } from '../../../server/services/missions/mission-runner.js';
import type { Mission } from '../../../server/services/missions/types.js';

function m(id: string, status: Mission['status'], createdAt = '2026-06-10T00:00:00.000Z'): Pick<Mission, 'id' | 'status' | 'created_at'> {
  return { id, status, created_at: createdAt };
}

describe('selectRunnableMissions (runner gating predicate)', () => {
  it('picks only active missions — briefed/draft/paused/review/completed never auto-advance', () => {
    const missions = [
      m('m_active', 'active'),
      m('m_briefed', 'briefed'),
      m('m_draft', 'draft'),
      m('m_paused', 'paused'),
      m('m_review', 'review'),
      m('m_done', 'completed'),
      m('m_aborted', 'aborted'),
    ];
    expect(selectRunnableMissions(missions, new Set())).toEqual(['m_active']);
  });

  it('excludes missions already in flight (per-mission lock)', () => {
    const missions = [m('m_1', 'active'), m('m_2', 'active')];
    expect(selectRunnableMissions(missions, new Set(['m_1']))).toEqual(['m_2']);
  });

  it('respects the global concurrency cap', () => {
    const missions = [m('m_1', 'active'), m('m_2', 'active'), m('m_3', 'active'), m('m_4', 'active')];
    const picked = selectRunnableMissions(missions, new Set(), 3);
    expect(picked).toHaveLength(3);
  });

  it('claims only the remaining capacity when missions are in flight', () => {
    const missions = [m('m_1', 'active'), m('m_2', 'active'), m('m_3', 'active')];
    const picked = selectRunnableMissions(missions, new Set(['m_other_a', 'm_other_b']), 3);
    expect(picked).toHaveLength(1);
  });

  it('returns empty at zero remaining capacity', () => {
    const missions = [m('m_1', 'active')];
    const inFlight = new Set(['a', 'b', 'c']);
    expect(selectRunnableMissions(missions, inFlight, 3)).toEqual([]);
  });

  it('orders oldest-created first (no starvation by new missions)', () => {
    const missions = [
      m('m_new', 'active', '2026-06-10T12:00:00.000Z'),
      m('m_old', 'active', '2026-06-01T00:00:00.000Z'),
      m('m_mid', 'active', '2026-06-05T00:00:00.000Z'),
    ];
    expect(selectRunnableMissions(missions, new Set(), 2)).toEqual(['m_old', 'm_mid']);
  });

  it('default cap is the documented constant', () => {
    const missions = Array.from({ length: 10 }, (_, i) => m(`m_${i}`, 'active' as const));
    expect(selectRunnableMissions(missions, new Set())).toHaveLength(RUNNER_MAX_CONCURRENT_MISSIONS);
  });
});
