import { describe, it, expect } from 'vitest';
import { activityForWallet } from '../activity';
import type { Activity } from '../types';

const A = 'fc_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const B = 'fc_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

// Minimal Activity rows — only the fields activityForWallet reads.
const sentTagged = (addr: string): Activity =>
  ({ direction: 'sent', at: 3, record: { walletAddress: addr } } as unknown as Activity);
const sentByPacs = (addr: string): Activity =>
  ({ direction: 'sent', at: 2, record: { pacs008: { debtor: { address: addr } } } } as unknown as Activity);
const sentUntagged = (): Activity =>
  ({ direction: 'sent', at: 1, record: {} } as unknown as Activity);
const received = (to: string): Activity =>
  ({ direction: 'received', at: 4, record: { toAddress: to } } as unknown as Activity);

describe('activityForWallet', () => {
  it('keeps sent rows whose walletAddress matches; drops other wallets', () => {
    const out = activityForWallet([sentTagged(A), sentTagged(B)], A);
    expect(out).toHaveLength(1);
    expect((out[0]!.record as { walletAddress: string }).walletAddress).toBe(A);
  });

  it('falls back to the pacs008 debtor address when walletAddress is absent', () => {
    expect(activityForWallet([sentByPacs(A)], A)).toHaveLength(1);
    expect(activityForWallet([sentByPacs(B)], A)).toHaveLength(0);
  });

  it('keeps un-attributable legacy sent rows under any wallet', () => {
    expect(activityForWallet([sentUntagged()], A)).toHaveLength(1);
    expect(activityForWallet([sentUntagged()], B)).toHaveLength(1);
  });

  it('scopes received rows by the recipient address', () => {
    expect(activityForWallet([received(A)], A)).toHaveLength(1);
    expect(activityForWallet([received(B)], A)).toHaveLength(0);
  });

  it('an empty address is a no-op (returns everything)', () => {
    const all = [sentTagged(A), received(B)];
    expect(activityForWallet(all, '')).toHaveLength(2);
  });

  it('mixed set scopes correctly to one wallet', () => {
    const all = [sentTagged(A), sentTagged(B), received(A), received(B), sentUntagged()];
    const out = activityForWallet(all, A);
    // A's send + A's receive + the untagged legacy send = 3
    expect(out).toHaveLength(3);
  });
});
