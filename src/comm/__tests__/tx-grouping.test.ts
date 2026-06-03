import { describe, it, expect } from 'vitest';
import { groupTxsByDay, type GroupLabeler } from '../services/tx-grouping';
import type { WalletTx } from '../services/transactions';

/** Minimal WalletTx factory — only the fields grouping touches. */
function tx(id: string, ts: number): WalletTx {
  return {
    id, ts, kind: 'send', counterparty: 'fc_x', amountMicroFtc: '1000',
    fiatValueAtTx: 0, fiatCurrency: 'FTC', ref: null, txHash: null,
    jurisdictionAtTx: null,
  };
}

const LABELER: GroupLabeler = {
  today: 'Today',
  yesterday: 'Yesterday',
  formatDate: (ms) => new Date(ms).toISOString().slice(0, 10),
};

// Fixed anchor — noon on 2026-06-03 (local). Avoids Date.now() so the
// Today/Yesterday boundaries are deterministic.
const NOW = new Date(2026, 5, 3, 12, 0, 0).getTime();
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('groupTxsByDay', () => {
  it('labels today / yesterday / older days', () => {
    const groups = groupTxsByDay([
      tx('t1', at(2026, 6, 3, 9)),   // today
      tx('y1', at(2026, 6, 2, 9)),   // yesterday
      tx('o1', at(2026, 5, 30, 9)),  // older
    ], LABELER, NOW);
    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', '2026-05-30']);
  });

  it('newest day first, newest item first within a day', () => {
    const groups = groupTxsByDay([
      tx('a', at(2026, 6, 3, 8)),
      tx('b', at(2026, 6, 3, 20)),
      tx('c', at(2026, 6, 2, 10)),
    ], LABELER, NOW);
    expect(groups[0]!.label).toBe('Today');
    expect(groups[0]!.items.map(i => i.id)).toEqual(['b', 'a']); // 20:00 before 08:00
    expect(groups[1]!.label).toBe('Yesterday');
  });

  it('buckets a late-night and early-morning tx into different days', () => {
    const groups = groupTxsByDay([
      tx('late', at(2026, 6, 2, 23)),
      tx('early', at(2026, 6, 3, 1)),
    ], LABELER, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe('Today');       // 06-03 01:00
    expect(groups[1]!.label).toBe('Yesterday');   // 06-02 23:00
  });

  it('returns an empty array for no transactions', () => {
    expect(groupTxsByDay([], LABELER, NOW)).toEqual([]);
  });
});
