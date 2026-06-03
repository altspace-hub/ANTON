/**
 * submit-status.test.ts — the fail-closed submit-status mapping.
 *
 * Regression guard for the bug where a hub-rejected payment showed as a
 * pending "Awaiting confirmation" screen: mapSubmitStatus() used to DEFAULT
 * any unrecognized/missing status to 'queued'. It must now fail closed —
 * only an explicit known-good status is treated as in-flight; everything
 * else is 'failed'.
 */
import { describe, it, expect } from 'vitest';
import { mapSubmitStatus } from '../payment';

describe('mapSubmitStatus — fail closed', () => {
  it('maps known in-flight statuses to queued', () => {
    for (const s of ['queued', 'pending', 'submitted', 'broadcast']) {
      expect(mapSubmitStatus(s)).toBe('queued');
    }
  });

  it('passes accepted + confirmed through', () => {
    expect(mapSubmitStatus('accepted')).toBe('accepted');
    expect(mapSubmitStatus('confirmed')).toBe('confirmed');
  });

  it('treats rejected / error / unknown / empty as FAILED (never awaiting)', () => {
    for (const s of ['rejected', 'error', 'failed', 'weird', '', 'API key required', 'attestation required']) {
      expect(mapSubmitStatus(s)).toBe('failed');
    }
  });
});
