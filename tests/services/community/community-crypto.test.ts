/**
 * community-crypto.test.ts — pure-function tests for the contact-hash +
 * conversation-id helpers in community-crypto.
 */

import { describe, it, expect } from 'vitest';
import {
  generateContactHash,
  hashContactId,
  isValidContactHash,
  getConversationId,
} from '../../../server/services/community-crypto.js';

describe('generateContactHash', () => {
  it('produces ANTON-XXXX-XXXX-XXXX-XXXX format', () => {
    const h = generateContactHash();
    expect(h).toMatch(/^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  });

  it('produces unique hashes per call (collision probability ~0)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateContactHash());
    expect(set.size).toBe(1000);
  });
});

describe('hashContactId', () => {
  it('returns a 32-char hex string', () => {
    const h = hashContactId('ANTON-1234-5678-9ABC-DEF0');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic for the same input', () => {
    const h1 = hashContactId('ANTON-1234-5678-9ABC-DEF0');
    const h2 = hashContactId('ANTON-1234-5678-9ABC-DEF0');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = hashContactId('ANTON-AAAA-BBBB-CCCC-DDDD');
    const h2 = hashContactId('ANTON-AAAA-BBBB-CCCC-DDDE');
    expect(h1).not.toBe(h2);
  });
});

describe('isValidContactHash', () => {
  it('accepts the canonical format', () => {
    expect(isValidContactHash('ANTON-1234-5678-9ABC-DEF0')).toBe(true);
    expect(isValidContactHash('ANTON-AAAA-BBBB-CCCC-DDDD')).toBe(true);
  });

  it('rejects lower-case (must be uppercase hex)', () => {
    expect(isValidContactHash('anton-1234-5678-9abc-def0')).toBe(false);
  });

  it('rejects wrong segment count or length', () => {
    expect(isValidContactHash('ANTON-1234-5678-9ABC')).toBe(false);
    expect(isValidContactHash('ANTON-12345-678-9ABC-DEF0')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidContactHash('ANTON-GGGG-HHHH-IIII-JJJJ')).toBe(false);
  });

  it('rejects empty + completely invalid', () => {
    expect(isValidContactHash('')).toBe(false);
    expect(isValidContactHash('not-a-hash')).toBe(false);
  });
});

describe('getConversationId', () => {
  const a = 'ANTON-AAAA-AAAA-AAAA-AAAA';
  const b = 'ANTON-BBBB-BBBB-BBBB-BBBB';

  it('returns a 32-char hex', () => {
    expect(getConversationId(a, b)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is symmetric — order of arguments does not matter', () => {
    expect(getConversationId(a, b)).toBe(getConversationId(b, a));
  });

  it('is deterministic', () => {
    expect(getConversationId(a, b)).toBe(getConversationId(a, b));
  });

  it('different pairs → different conversation ids', () => {
    const c = 'ANTON-CCCC-CCCC-CCCC-CCCC';
    expect(getConversationId(a, b)).not.toBe(getConversationId(a, c));
  });

  it('self-conversation has a stable id', () => {
    expect(getConversationId(a, a)).toBe(getConversationId(a, a));
  });
});
