/**
 * agent-identity.test.ts — the pseudonymous "ANTON <addr6>" debtor name +
 * the env-configured human UBO. Mirrors the Pay app's agent-wallet.test.ts
 * so the identity stays byte-identical across the two.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentDebtorName, resolveUbo } from '../../src/main/agent-identity.js';

describe('agentDebtorName', () => {
  it('is "ANTON " + the first 6 Base58 chars after the fc_ prefix', () => {
    expect(agentDebtorName('fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY')).toBe('ANTON VQjZM7');
    expect(agentDebtorName('fc_ABCDEFghij')).toBe('ANTON ABCDEF');
  });

  it('tolerates an address without the fc_ prefix', () => {
    expect(agentDebtorName('VQjZM7gjtQF1')).toBe('ANTON VQjZM7');
  });

  it('handles a short address without throwing', () => {
    expect(agentDebtorName('fc_AB')).toBe('ANTON AB');
  });
});

describe('resolveUbo', () => {
  const SAVED = { name: process.env.AGENT_PAY_UBO_NAME, country: process.env.AGENT_PAY_UBO_COUNTRY };
  beforeEach(() => { delete process.env.AGENT_PAY_UBO_NAME; delete process.env.AGENT_PAY_UBO_COUNTRY; });
  afterEach(() => {
    if (SAVED.name === undefined) delete process.env.AGENT_PAY_UBO_NAME; else process.env.AGENT_PAY_UBO_NAME = SAVED.name;
    if (SAVED.country === undefined) delete process.env.AGENT_PAY_UBO_COUNTRY; else process.env.AGENT_PAY_UBO_COUNTRY = SAVED.country;
  });

  it('returns null when no owner is configured (anywhere)', () => {
    expect(resolveUbo()).toBeNull();
    expect(resolveUbo({ name: '   ' })).toBeNull(); // blank override is no owner
  });

  it('reads the owner from the environment', () => {
    process.env.AGENT_PAY_UBO_NAME = 'Daniel Bardun';
    process.env.AGENT_PAY_UBO_COUNTRY = 'SE';
    expect(resolveUbo()).toEqual({ name: 'Daniel Bardun', countryOfResidence: 'SE' });
  });

  it('omits the country when AGENT_PAY_UBO_COUNTRY is unset', () => {
    process.env.AGENT_PAY_UBO_NAME = 'Daniel Bardun';
    expect(resolveUbo()).toEqual({ name: 'Daniel Bardun' });
  });

  it('an explicit override wins over the environment', () => {
    process.env.AGENT_PAY_UBO_NAME = 'Env Owner';
    process.env.AGENT_PAY_UBO_COUNTRY = 'NO';
    expect(resolveUbo({ name: 'Daniel Bardun', countryOfResidence: 'SE' }))
      .toEqual({ name: 'Daniel Bardun', countryOfResidence: 'SE' });
  });

  it('trims whitespace', () => {
    process.env.AGENT_PAY_UBO_NAME = '  Daniel Bardun  ';
    process.env.AGENT_PAY_UBO_COUNTRY = ' SE ';
    expect(resolveUbo()).toEqual({ name: 'Daniel Bardun', countryOfResidence: 'SE' });
  });
});
