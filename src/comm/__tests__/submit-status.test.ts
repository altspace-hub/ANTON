/**
 * submit-status.test.ts — Comm send fail-closed submit handling.
 *
 * sendOnChain() throws unless the hub returns an explicit accepted status
 * (ACCEPTED_SUBMIT_STATUSES) and no error/reason/detail — so a hub reject
 * (e.g. "attestation required") surfaces as an error instead of being
 * recorded as a pending WalletTx that never lands.
 */
import { describe, it, expect } from 'vitest';
import { mapSubmitStatus, ACCEPTED_SUBMIT_STATUSES } from '../services/payment';

describe('Comm submit fail-closed', () => {
  it('accepts only known-good statuses', () => {
    for (const s of ['queued', 'pending', 'submitted', 'broadcast', 'accepted', 'confirmed']) {
      expect(ACCEPTED_SUBMIT_STATUSES.has(s)).toBe(true);
    }
    for (const s of ['rejected', 'error', 'failed', '', 'weird', 'attestation required']) {
      expect(ACCEPTED_SUBMIT_STATUSES.has(s)).toBe(false);
    }
  });

  it('maps accepted statuses onto the WalletTx lifecycle', () => {
    expect(mapSubmitStatus('accepted')).toBe('accepted');
    expect(mapSubmitStatus('confirmed')).toBe('confirmed');
    expect(mapSubmitStatus('queued')).toBe('queued');
    expect(mapSubmitStatus('pending')).toBe('queued');
  });
});
