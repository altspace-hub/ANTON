import { describe, it, expect } from 'vitest';
import { coerceDecision } from '../../src/main/coerce-decision.js';

describe('coerceDecision', () => {
  it('carries the passphrase through on approve (regression: it was dropped, breaking passphrase wallets)', () => {
    expect(coerceDecision({ kind: 'approve', passphrase: 'hunter2' })).toEqual({
      kind: 'approve',
      passphrase: 'hunter2',
    });
  });

  it('approve without a passphrase has no passphrase field', () => {
    expect(coerceDecision({ kind: 'approve' })).toEqual({ kind: 'approve' });
  });

  it('ignores an empty-string passphrase on approve', () => {
    expect(coerceDecision({ kind: 'approve', passphrase: '' })).toEqual({ kind: 'approve' });
  });

  it('ignores a non-string passphrase on approve', () => {
    expect(coerceDecision({ kind: 'approve', passphrase: 1234 })).toEqual({ kind: 'approve' });
  });

  it('preserves the reject reason', () => {
    expect(coerceDecision({ kind: 'reject', reason: 'user cancelled' })).toEqual({
      kind: 'reject',
      reason: 'user cancelled',
    });
  });

  it('defaults a missing reject reason', () => {
    expect(coerceDecision({ kind: 'reject' })).toEqual({ kind: 'reject', reason: 'rejected' });
  });

  it('fails closed (reject) on any malformed payload — never silently approves', () => {
    const malformed: unknown[] = [null, undefined, {}, { kind: 'maybe' }, 'approve', 42, []];
    for (const bad of malformed) {
      expect(coerceDecision(bad)).toEqual({ kind: 'reject', reason: 'malformed renderer response' });
    }
  });
});
